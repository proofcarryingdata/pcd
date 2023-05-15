import { serializeSemaphoreGroup } from "@pcd/semaphore-group-pcd";
import { Group } from "@semaphore-protocol/group";
import { ClientBase, Pool } from "pg";
import { ParticipantRole, PassportParticipant } from "../database/models";
import { fetchPassportParticipants } from "../database/queries/fetchParticipant";
import {
  getGroupByRoot,
  getLatestSemaphoreGroups,
  HistoricSemaphoreGroup,
  insertNewSemaphoreGroup,
} from "../database/queries/historicSemaphore";
import { traced } from "./telemetry";

// Semaphore service maintains the Zuzalu participant semaphore groups.
export class SemaphoreService {
  // Groups by ID
  groups = SemaphoreService.createGroups();
  dbPool: Pool | ClientBase | undefined;

  static createGroups(): NamedGroup[] {
    return [
      { name: "Zuzalu Participants", group: new Group("1", 16) },
      { name: "Zuzalu Residents", group: new Group("2", 16) },
      { name: "Zuzalu Visitors", group: new Group("3", 16) },
      { name: "Zuzalu Organizers", group: new Group("4", 16) },
    ];
  }

  setPool(dbPool: Pool | ClientBase) {
    this.dbPool = dbPool;
  }

  groupParticipants = () => this.getNamedGroup("1");
  groupResidents = () => this.getNamedGroup("2");
  groupVisitors = () => this.getNamedGroup("3");
  groupOrganizers = () => this.getNamedGroup("4");

  getNamedGroup(id: string): NamedGroup {
    const ret = this.groups.find((g) => g.group.id === id);
    if (!ret) throw new Error("Missing group " + id);
    return ret;
  }

  // Zuzalu participants by UUID
  participants = {} as Record<string, PassportParticipant>;

  // Get a participant by UUID, or null if not found.
  getParticipant(uuid: string): PassportParticipant | null {
    return this.participants[uuid] || null;
  }

  getParticipantByCommitment(commitment: string): PassportParticipant | null {
    const participants = Object.values(this.participants);
    for (const participant of participants) {
      if (participant.commitment === commitment) {
        return participant;
      }
    }
    return null;
  }

  // Load participants from DB, rebuild semaphore groups
  async reload() {
    return traced("Semaphore", "reload", async (span) => {
      if (!this.dbPool) {
        throw new Error("no database connection");
      }

      console.log(`[SEMA] Reloading semaphore service...`);
      const ps = await fetchPassportParticipants(this.dbPool);
      console.log(`[SEMA] Rebuilding groups, ${ps.length} total participants.`);
      this.groups = SemaphoreService.createGroups();
      this.setGroups(ps);
      console.log(`[SEMA] Semaphore service reloaded.`);
      span?.setAttribute("participants", ps.length);
      this.saveHistoricSemaphoreGroups();
    });
  }

  async saveHistoricSemaphoreGroups() {
    if (!this.dbPool) {
      throw new Error("no database connection");
    }

    console.log(`[SEMA] Semaphore service - diffing historic semaphore groups`);

    const latestGroups = await getLatestSemaphoreGroups(this.dbPool);

    for (const localGroup of this.groups) {
      const correspondingLatestGroup = latestGroups.find(
        (g) => g.groupId === localGroup.group.id
      );

      if (
        correspondingLatestGroup == null ||
        correspondingLatestGroup.rootHash !== localGroup.group.root.toString()
      ) {
        console.log(
          `[SEMA] outdated semaphore group ${localGroup.group.id}` +
            ` - appending a new one into the database`
        );

        await insertNewSemaphoreGroup(
          this.dbPool,
          localGroup.group.id.toString(),
          localGroup.group.root.toString(),
          JSON.stringify(
            serializeSemaphoreGroup(localGroup.group, localGroup.name)
          )
        );
      } else {
        console.log(
          `[SEMA] group '${localGroup.group.id}' is not outdated, not appending to group history`
        );
      }
    }
  }

  async getHistoricSemaphoreGroup(
    groupId: string,
    rootHash: string
  ): Promise<HistoricSemaphoreGroup | undefined> {
    if (!this.dbPool) {
      throw new Error("no database connection");
    }

    return getGroupByRoot(this.dbPool, groupId, rootHash);
  }

  async getHistoricSemaphoreGroupValid(
    groupId: string,
    rootHash: string
  ): Promise<boolean> {
    if (!this.dbPool) {
      throw new Error("no database connection");
    }

    const group = await getGroupByRoot(this.dbPool, groupId, rootHash);

    return group !== undefined;
  }

  async getLatestSemaphoreGroups(): Promise<HistoricSemaphoreGroup[]> {
    if (!this.dbPool) {
      throw new Error("no database connection");
    }

    return getLatestSemaphoreGroups(this.dbPool);
  }

  setGroups(participants: PassportParticipant[]) {
    this.participants = {};
    this.groups = SemaphoreService.createGroups();

    const groupToParticipants: Map<string, PassportParticipant[]> = new Map();
    const groupsById: Map<string, NamedGroup> = new Map();

    for (const group of this.groups) {
      groupToParticipants.set(group.group.id.toString(), []);
      groupsById.set(group.group.id.toString(), group);
    }

    for (const p of participants) {
      this.participants[p.uuid] = p;

      const participantGroups = this.getGroupsForRole(p.role);
      for (const group of participantGroups) {
        const participantsInGroup = groupToParticipants.get(
          group.group.id.toString()
        );
        participantsInGroup && participantsInGroup.push(p);
      }
    }

    for (const groupParticipants of groupToParticipants.entries()) {
      const namedGroup = groupsById.get(groupParticipants[0]);
      if (namedGroup) {
        const participantIds = groupParticipants[1].map((p) => p.commitment);
        const replacementGroup = new Group(
          namedGroup?.group.id,
          namedGroup?.group.depth,
          participantIds
        );
        namedGroup.group = replacementGroup;

        for (const p of groupParticipants[1]) {
          console.log(
            `[SEMA] Adding ${p.role} ${p.email} to sema group ${namedGroup.name}`
          );
        }
      }
    }
  }

  // Get the semaphore groups for a participant role
  getGroupsForRole(role: ParticipantRole): NamedGroup[] {
    switch (role) {
      case ParticipantRole.Organizer:
        return [this.groupOrganizers(), this.groupResidents()];
      case ParticipantRole.Resident:
        return [this.groupResidents()];
      case ParticipantRole.Visitor:
        return [this.groupVisitors()];
      default:
        throw new Error(`unsupported role ${role}`);
    }
  }
}

export const semaphoreService = new SemaphoreService();

export function startSemaphoreService({ dbPool }: { dbPool: Pool }) {
  semaphoreService.setPool(dbPool);
  semaphoreService.reload();

  // Reload every minute
  setInterval(() => {
    semaphoreService.reload();
  }, 60 * 1000);
}

export interface NamedGroup {
  name: string;
  group: Group;
}
