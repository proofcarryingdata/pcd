import { ZuzaluUserRole } from "@pcd/passport-interface";
import { serializeSemaphoreGroup } from "@pcd/semaphore-group-pcd";
import { Group } from "@semaphore-protocol/group";
import { Pool } from "postgres-pool";
import { HistoricSemaphoreGroup, LoggedInZuzaluUser } from "../database/models";
import {
  fetchHistoricGroupByRoot,
  fetchLatestHistoricSemaphoreGroups,
  insertNewHistoricSemaphoreGroup
} from "../database/queries/historicSemaphore";
import {
  fetchAllUsers,
  fetchAllUsersWithDevconnectSuperuserTickets,
  fetchAllUsersWithDevconnectTickets
} from "../database/queries/users";
import { fetchAllLoggedInZuconnectUsers } from "../database/queries/zuconnect/fetchZuconnectUsers";
import { fetchAllLoggedInZuzaluUsers } from "../database/queries/zuzalu_pretix_tickets/fetchZuzaluUser";
import { PCDHTTPError } from "../routing/pcdHttpError";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { zuconnectProductIdToZuzaluRole } from "../util/zuconnectTicket";
import { traced } from "./telemetryService";

type LoggedInZuzaluOrZuconnectUser = Pick<
  LoggedInZuzaluUser,
  "email" | "role" | "commitment"
>;

export const enum SemaphoreGroups {
  ZuzaluParticipants = "1",
  ZuzaluResidents = "2",
  ZuzaluVisitors = "3",
  ZuzaluOrganizers = "4",
  Everyone = "5",
  DevconnectAttendees = "6",
  DevconnectOrganizers = "7"
}

/**
 * Responsible for maintaining semaphore groups for all the categories of users
 * that Zupass is aware of.
 */
export class SemaphoreService {
  private interval: NodeJS.Timer | undefined;
  private groups: Map<string, NamedGroup>;
  private dbPool: Pool;

  public groupParticipants = (): NamedGroup => this.getNamedGroup("1");
  public groupResidents = (): NamedGroup => this.getNamedGroup("2");
  public groupVisitors = (): NamedGroup => this.getNamedGroup("3");
  public groupOrganizers = (): NamedGroup => this.getNamedGroup("4");
  public groupEveryone = (): NamedGroup => this.getNamedGroup("5");
  public groupDevconnectAttendees = (): NamedGroup => this.getNamedGroup("6");
  public groupDevconnectOrganizers = (): NamedGroup => this.getNamedGroup("7");

  public constructor(config: ApplicationContext) {
    this.dbPool = config.dbPool;
    this.groups = SemaphoreService.createGroups();
  }

  private static createGroups(): Map<string, NamedGroup> {
    return new Map(
      // @todo: deprecate groups 1-4
      // Blocked on Zupoll, Zucast, and zuzalu.city
      [
        {
          name: "Zuzalu Participants",
          group: new Group(SemaphoreGroups.ZuzaluParticipants, 16)
        },
        {
          name: "Zuzalu Residents",
          group: new Group(SemaphoreGroups.ZuzaluResidents, 16)
        },
        {
          name: "Zuzalu Visitors",
          group: new Group(SemaphoreGroups.ZuzaluVisitors, 16)
        },
        {
          name: "Zuzalu Organizers",
          group: new Group(SemaphoreGroups.ZuzaluOrganizers, 16)
        },
        { name: "Everyone", group: new Group(SemaphoreGroups.Everyone, 16) },
        {
          name: "Devconnect Attendees",
          group: new Group(SemaphoreGroups.DevconnectAttendees, 16)
        },
        {
          name: "Devconnect Organizers",
          group: new Group(SemaphoreGroups.DevconnectOrganizers, 16)
        }
      ].map((namedGroup) => [namedGroup.group.id.toString(), namedGroup])
    );
  }

  public getNamedGroup(id: string): NamedGroup {
    const ret = this.groups.get(id);
    if (!ret) throw new PCDHTTPError(404, "Missing group " + id);
    return ret;
  }

  public start(): void {
    this.interval = setInterval(() => {
      // Reload every minute
      this.scheduleReload();
    }, 60 * 1000);
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  public scheduleReload(): void {
    setTimeout(() => {
      this.reload().catch((e) => {
        logger("[SEMA] failed to reload", e);
      });
    }, 1);
  }

  /**
   * Load users from DB, rebuild semaphore groups
   */
  public async reload(): Promise<void> {
    return traced("Semaphore", "reload", async () => {
      logger(`[SEMA] Reloading semaphore service...`);

      await this.reloadZuzaluGroups();
      // turned off for devconnect - lots of users = slow global group.
      // await this.reloadGenericGroup();
      await this.reloadDevconnectGroups();
      await this.saveHistoricSemaphoreGroups();

      logger(`[SEMA] Semaphore service reloaded.`);
    });
  }

  private async reloadGenericGroup(): Promise<void> {
    return traced("Semaphore", "reloadGenericGroup", async (span) => {
      const allUsers = await fetchAllUsers(this.dbPool);
      span?.setAttribute("users", allUsers.length);
      logger(`[SEMA] Rebuilding groups, ${allUsers.length} total users.`);

      const namedGroup = this.getNamedGroup("5");
      const newGroup = new Group(
        namedGroup.group.id,
        namedGroup.group.depth,
        allUsers.map((c) => c.commitment)
      );
      namedGroup.group = newGroup;
    });
  }

  /**
   * Calculates the changes to the group compared to the latest set of
   * members.
   */
  private calculateGroupChanges(
    group: NamedGroup,
    latestMembers: string[]
  ): { toAdd: string[]; toRemove: string[] } {
    const groupMembers = group.group.members
      .filter((m) => m !== group.group.zeroValue)
      .map((m) => m.toString());

    const groupMemberSet = new Set(groupMembers);

    const toAdd = latestMembers.filter((id) => !groupMemberSet.has(id));
    const latestMemberSet = new Set(latestMembers);
    const toRemove = groupMembers.filter(
      (id) => !latestMemberSet.has(id.toString())
    );

    return {
      toAdd,
      toRemove
    };
  }

  /**
   * Populates two Devconnect-related groups: attendees, which includes all
   * users with any Devconnect ticket, and organizers, which includes all
   * users with any superuser Devconnect ticket.
   */
  private async reloadDevconnectGroups(): Promise<void> {
    return traced("Semaphore", "reloadDevconnectGroups", async (span) => {
      const devconnectAttendees = await fetchAllUsersWithDevconnectTickets(
        this.dbPool
      );
      const devconnectOrganizers =
        await fetchAllUsersWithDevconnectSuperuserTickets(this.dbPool);

      span?.setAttribute("attendees", devconnectAttendees.length);
      span?.setAttribute("organizers", devconnectOrganizers.length);
      const start = performance.now();

      logger(
        `[SEMA] Rebuilding Devconnect attendee group, ${devconnectAttendees.length} total users.`
      );
      logger(
        `[SEMA] Rebuilding Devconnect organizer group, ${devconnectOrganizers.length} total users.`
      );

      const attendeesGroupUserIds = devconnectAttendees.map(
        (user) => user.commitment
      );
      const organizersGroupUserIds = devconnectOrganizers.map(
        (user) => user.commitment
      );

      const attendeesNamedGroup = this.groups.get(
        SemaphoreGroups.DevconnectAttendees
      );
      const organizersNamedGroup = this.groups.get(
        SemaphoreGroups.DevconnectOrganizers
      );

      if (attendeesNamedGroup) {
        const { toAdd, toRemove } = this.calculateGroupChanges(
          attendeesNamedGroup,
          attendeesGroupUserIds
        );

        span?.setAttribute("attendees_added", toAdd.length);
        span?.setAttribute("attendees_removed", toRemove.length);
        logger(
          `[SEMA] Adding ${toAdd.length}, removing ${toRemove.length} attendees.`
        );

        for (const newId of toAdd) {
          attendeesNamedGroup.group.addMember(newId);
        }

        for (const deletedId of toRemove) {
          attendeesNamedGroup.group.removeMember(
            attendeesNamedGroup.group.indexOf(BigInt(deletedId))
          );
        }
      }

      if (organizersNamedGroup) {
        const { toAdd, toRemove } = this.calculateGroupChanges(
          organizersNamedGroup,
          organizersGroupUserIds
        );

        span?.setAttribute("organizers_added", toAdd.length);
        span?.setAttribute("organizers_removed", toRemove.length);
        logger(
          `[SEMA] Adding ${toAdd.length}, removing ${toRemove.length} attendees.`
        );

        for (const newId of toAdd) {
          organizersNamedGroup.group.addMember(newId);
        }

        for (const deletedId of toRemove) {
          organizersNamedGroup.group.removeMember(
            organizersNamedGroup.group.indexOf(BigInt(deletedId))
          );
        }
      }

      const duration = performance.now() - start;
      span?.setAttribute("duration", duration);
      logger(`[SEMA] Took ${duration}ms to update Devconnect semaphore groups`);
    });
  }

  private async saveHistoricSemaphoreGroups(): Promise<void> {
    if (!this.dbPool) {
      throw new Error("no database connection");
    }

    logger(`[SEMA] Semaphore service - diffing historic semaphore groups`);

    const latestGroups = await fetchLatestHistoricSemaphoreGroups(this.dbPool);

    for (const localGroup of this.groups.values()) {
      const correspondingLatestGroup = latestGroups.find(
        (g) => g.groupId === localGroup.group.id
      );

      if (
        correspondingLatestGroup == null ||
        correspondingLatestGroup.rootHash !== localGroup.group.root.toString()
      ) {
        logger(
          `[SEMA] outdated semaphore group ${localGroup.group.id}` +
            ` - appending a new one into the database`
        );

        await insertNewHistoricSemaphoreGroup(
          this.dbPool,
          localGroup.group.id.toString(),
          localGroup.group.root.toString(),
          JSON.stringify(
            serializeSemaphoreGroup(localGroup.group, localGroup.name)
          )
        );
      } else {
        logger(
          `[SEMA] group '${localGroup.group.id}' is not outdated, not appending to group history`
        );
      }
    }
  }

  public async getHistoricSemaphoreGroup(
    groupId: string,
    rootHash: string
  ): Promise<HistoricSemaphoreGroup | undefined> {
    return fetchHistoricGroupByRoot(this.dbPool, groupId, rootHash);
  }

  public async getHistoricSemaphoreGroupValid(
    groupId: string,
    rootHash: string
  ): Promise<boolean> {
    const group = await fetchHistoricGroupByRoot(
      this.dbPool,
      groupId,
      rootHash
    );
    return group !== undefined;
  }

  public async getLatestSemaphoreGroups(): Promise<HistoricSemaphoreGroup[]> {
    return fetchLatestHistoricSemaphoreGroups(this.dbPool);
  }

  private async reloadZuzaluGroups(): Promise<void> {
    return traced("Semaphore", "reloadZuzaluGroups", async (span) => {
      const zuzaluUsers: LoggedInZuzaluOrZuconnectUser[] =
        await fetchAllLoggedInZuzaluUsers(this.dbPool);
      const zuconnectUsers = await fetchAllLoggedInZuconnectUsers(this.dbPool);
      // Give Zuconnect users roles equivalent to Zuzalu roles
      const zuconnectUsersWithZuzaluRoles = zuconnectUsers.map((user) => {
        return {
          email: user.attendee_email,
          role: zuconnectProductIdToZuzaluRole(user.product_id),
          commitment: user.commitment
        };
      });

      const users = zuzaluUsers.concat(zuconnectUsersWithZuzaluRoles);

      span?.setAttribute("users", users.length);
      logger(`[SEMA] Rebuilding groups, ${users.length} total users.`);

      // Zuzalu groups get totally re-created
      const newGroups = SemaphoreService.createGroups();
      const zuzaluGroups = [];
      for (const id of [
        SemaphoreGroups.ZuzaluParticipants,
        SemaphoreGroups.ZuzaluResidents,
        SemaphoreGroups.ZuzaluVisitors,
        SemaphoreGroups.ZuzaluOrganizers
      ]) {
        const group = newGroups.get(id) as NamedGroup;
        zuzaluGroups.push(group);
        this.groups.set(id, group);
      }

      const groupIdsToUsers: Map<string, LoggedInZuzaluOrZuconnectUser[]> =
        new Map();
      const groupsById: Map<string, NamedGroup> = new Map();
      for (const group of zuzaluGroups) {
        groupIdsToUsers.set(group.group.id.toString(), []);
        groupsById.set(group.group.id.toString(), group);
      }

      logger(`[SEMA] initializing ${this.groups.size} groups`);
      logger(`[SEMA] inserting ${users.length} users`);

      // calculate which users go into which groups
      for (const p of users) {
        const groupsOfThisUser = this.getZuzaluGroupsForRole(p.role);
        for (const namedGroup of groupsOfThisUser) {
          logger(
            `[SEMA] Adding ${p.role} ${p.email} to sema group ${namedGroup.name}`
          );
          const usersInGroup = groupIdsToUsers.get(
            namedGroup.group.id.toString()
          );
          // The same user might appear twice, due to having both a Zuzalu and
          // Zuconnect ticket. However, there is no need to include them in a
          // group they are already a member of.
          if (
            !usersInGroup?.find(
              (user) =>
                user.commitment === p.commitment &&
                user.email === p.email &&
                user.role === p.role
            )
          ) {
            usersInGroup?.push(p);
          }
        }
      }

      // based on the above calculation, instantiate each semaphore group
      for (const entry of groupIdsToUsers.entries()) {
        const groupUsers = entry[1];
        const namedGroup = groupsById.get(entry[0]);

        if (namedGroup) {
          logger(
            `[SEMA] replacing group ${namedGroup.name} with ${groupUsers.length} users`
          );
          const userIds = groupUsers.map((p) => p.commitment);
          const newGroup = new Group(
            namedGroup.group.id,
            namedGroup.group.depth,
            userIds
          );
          namedGroup.group = newGroup;
        }
      }
    });
  }

  // Get the semaphore groups for a participant role
  private getZuzaluGroupsForRole(role: ZuzaluUserRole): NamedGroup[] {
    switch (role) {
      case ZuzaluUserRole.Organizer:
        return [
          this.groupParticipants(),
          this.groupOrganizers(),
          this.groupResidents()
        ];
      case ZuzaluUserRole.Resident:
        return [this.groupParticipants(), this.groupResidents()];
      case ZuzaluUserRole.Visitor:
        return [this.groupParticipants(), this.groupVisitors()];
      default:
        throw new Error(`unsupported role ${role}`);
    }
  }
}

export function startSemaphoreService(
  context: ApplicationContext
): SemaphoreService {
  const semaphoreService = new SemaphoreService(context);
  semaphoreService.start();
  semaphoreService.scheduleReload();
  return semaphoreService;
}

export interface NamedGroup {
  name: string;
  group: Group;
}
