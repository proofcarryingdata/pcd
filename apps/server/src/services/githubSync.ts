import opentelemetry from "@opentelemetry/api";
import _ from "lodash";
import PQueue from "p-queue";
import {
  Contribution,
  Contributor,
  initOctokit,
  loadOrganizationRepos,
  loadRepoByUrl,
  loadRepositoryContributors,
  loadUserKeys,
  PublicKey,
  Repo,
} from "../apis/githubAPI";

const params: InitialSyncParameters = {
  hardcodedOrganizationNames: ["ethereum"],
  hardcodedRepositoryUrls: ["https://github.com/ethers-io/ethers.js/"],
  hardcodedUsers: ["ichub"],
};

export async function githubSync(): Promise<void> {
  const tracer = opentelemetry.trace.getTracer("github");
  console.log(`[GITHUB] initializing sync`, params);

  tracer.startActiveSpan("githubSync", async (span) => {
    const octokit = initOctokit();
    const queue = new PQueue({
      concurrency: 5,
      interval: 1000,
      intervalCap: 5,
    });

    const repos: Repo[] = [];
    const hardcodedRepositories = await Promise.all(
      params.hardcodedRepositoryUrls.map((url) =>
        loadRepoByUrl(url, octokit, queue)
      )
    );
    repos.push(...(hardcodedRepositories.filter((r) => !!r) as Repo[]));

    const orgRepositories = _.flatten(
      await Promise.all(
        params.hardcodedOrganizationNames.map((org) =>
          loadOrganizationRepos(org, octokit, queue)
        )
      )
    );
    repos.push(...orgRepositories);

    const contributions: Contribution[] = [];
    const allContributors: Contributor[] = [];

    for (const repo of repos) {
      const contributors = await loadRepositoryContributors(
        repo,
        octokit,
        queue
      );
      contributors.forEach((c) =>
        contributions.push({
          contributor: c,
          repo,
        })
      );
      allContributors.push(...contributors);
    }

    const uniqueContributors = _.uniqBy(allContributors, (c) => c.login);
    console.log(`[GITHUB] Loaded ${uniqueContributors.length} contributors`);

    const allKeys: PublicKey[] = [];
    for (let i = 0; i < uniqueContributors.length; i++) {
      console.log(`[GITHUB] Contributor ${i + 1}/${uniqueContributors.length}`);
      const contributor = uniqueContributors[i];

      if (!contributor.id) {
        continue; // this contributor was anonymous.
      }
      const keys = await loadUserKeys(contributor.id, octokit, queue);
      allKeys.push(...keys);
    }

    console.log(
      `[GITHUB] ${hardcodedRepositories.length} repositories
[GITHUB] ${contributions.length} contributions
[GITHUB] ${uniqueContributors.length} contributors
[GITHUB] ${allKeys.length} keys
[GITHUB] ${uniqueContributors.map((c) => c.login).join(", ")}
[GITHUB] Sync complete`
    );
    span.end();
  });
}

export interface InitialSyncParameters {
  hardcodedOrganizationNames: string[];
  hardcodedRepositoryUrls: string[];
  hardcodedUsers: string[];
}
