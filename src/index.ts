// Provides dev-time type structures for  `danger` - doesn't affect runtime.
import { DangerDSLType } from "../node_modules/danger/distribution/dsl/DangerDSL";
import * as __dm from "danger";
import { Client } from "@notionhq/client";

declare const danger: DangerDSLType;
export declare function message(message: string): void;
export declare function warn(message: string): void;
export declare function fail(message: string): void;
export declare function markdown(message: string): void;

type PRStatusMap = Record<__dm.GitHubPRDSL["state"], string>;

type NotionTaskInfo = {
  title: string;
  url: string;
};

type NotionSyncConfig = {
  /**
   * The Notion user which own the tasks to sync.
   */
  notionUser: string;

  /**
   * The mapping between the PR status and the Notion Page status.
   *
   * Example:
   * ```ts
   * {
   *  open: "In progress",
   *  closed: "Done",
   *  merged: "Done",
   *  locked: "Done"
   * }
   * ```
   */
  prStatusMap: PRStatusMap;

  /**
   * The list of trigger words to use to detect the Notion task.
   * The default value is the same list that GitHub uses to close issues.
   *
   * Default:
   * ```ts
   * ["close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved"]
   * ```
   */
  triggerWords?: Array<string>;
};

export const defaultTriggerWords = [
  "close",
  "closes",
  "closed",
  "fix",
  "fixes",
  "fixed",
  "resolve",
  "resolves",
  "resolved",
];

/**
 * Retrieve all the Notion tasks from a string.
 */
export const parseNotionLinks = (
  notionUser: string,
  triggerWords: Array<string>,
  str: string
): Array<string> => {
  const notionLinkRegex = new RegExp(
    `(?:${triggerWords.join(
      "|"
    )})\\s+(https:\\/\\/www\\.notion\\.so\\/${notionUser}\\/[^\\s]+-\\w+)`,
    "gi"
  );

  return str.match(notionLinkRegex) || [];
};

/**
 * Parse the Task ID from a Notion URL.
 */
export const parseTaskIdFromUrl = (url: string): string | null =>
  url.split("-").pop() || null;

/**
 * Generate the Task Status from the PR state.
 *
 * N.B. At the moment a "closed but not merged" PR will
 * be moved inside the "Done" board too. This scenario is not
 * really common and we are going to handle it with a custom board
 * in the future if needed.
 */
const generateTaskStatus = (
  prStatusMap: PRStatusMap,
  prStatus: __dm.GitHubPRDSL["state"]
): string => {
  return prStatusMap[prStatus];
};

/**
 * Update a single Notion task using the current
 * PR to compute the various properties. This function
 * will also return all the details of the same task.
 */
const updateNotionTask = (
  notion: Client,
  taskId: string,
  prStatusMap: PRStatusMap,
  pr: {
    status: __dm.GitHubPRDSL["state"];
    url: string;
  }
) => {
  console.log("Updating Notion task", taskId);

  const taskStatus = generateTaskStatus(prStatusMap, pr.status);

  return notion.pages.update({
    page_id: taskId,
    properties: {
      Status: { status: { name: taskStatus } },
      "Pull Request": { url: pr.url },
    },
  });
};

/**
 * Execute the Notion Sync job in the Danger bot
 * in order to synchronize all the Notion tasks linked
 * to the current PR.
 */
const notionTasks = async (config: NotionSyncConfig) => {
  console.log("Executing Notion Tasks sync");

  const { notionUser, prStatusMap, triggerWords } = config;
  const computedTriggerWords = triggerWords ?? defaultTriggerWords;
  const notionToken = process.env.NOTION_TOKEN || "";
  const repoName = danger.github.pr.base.repo.name;
  const repoOwner = danger.github.pr.base.repo.owner.login;
  const prNumber = danger.github.pr.number;
  const prDescription = danger.github.pr.body;
  const prStatus = danger.github.pr.state;
  const prUrl = `https://github.com/${repoOwner}/${repoName}/pull/${prNumber}`;

  // Initialize the Notion client.
  const notion = new Client({
    auth: notionToken,
  });

  // Retrieve all the Notion urls in the PR body.
  const tasksUrls = parseNotionLinks(
    notionUser,
    computedTriggerWords,
    prDescription
  );

  // Parse all the Notion page IDs from the retrieved urls
  // creating an object map with the ID as a key and the url
  // as a value.
  const tasksIdsMap = tasksUrls.reduce((acc, next) => {
    const id = parseTaskIdFromUrl(next);
    return id ? { ...acc, [id]: next } : acc;
  }, {} as Record<string, string>);

  // Create an array of task ids.
  const tasksIds = Object.keys(tasksIdsMap);

  if (tasksIds.length <= 0) {
    console.log("There are zero Notion tasks in this PR");
  }

  // Execute the update returning the computed
  // tasks as a list of urls.
  const computedTasks: Array<NotionTaskInfo | null> = await Promise.all(
    tasksIds.map((taskId) =>
      // This promise won't reject, printing
      // a possible error to STDOUT.
      updateNotionTask(notion, taskId, prStatusMap, {
        status: prStatus,
        url: prUrl,
      })
        .then((res) => {
          console.log("Task updated successfully", JSON.stringify(res));

          if ("properties" in res) {
            const url = res.url;

            const title =
              res.properties.Title.type === "title"
                ? res.properties.Title.title
                    .reduce((acc, next) => `${acc}${next.plain_text}`, "")
                    .trim() || url
                : url;

            return { title, url };
          } else if (tasksIdsMap[taskId]) {
            return {
              title: tasksIdsMap[taskId],
              url: tasksIdsMap[taskId],
            };
          } else {
            return null;
          }
        })
        .catch((err) => {
          console.error(err);
          return null;
        })
    )
  );

  // Retrieve all the tasks updated successfully.
  const successfulTasks = computedTasks.filter(
    (info: NotionTaskInfo | null): info is NotionTaskInfo =>
      typeof info !== null
  );

  if (successfulTasks.length <= 0) {
    console.warn("Tasks processed but nothing to show");
    return;
  }

  // Create a list of tasks to add
  // inside the Danger comment.
  const tasksListStr = successfulTasks.reduce(
    (acc, next) => acc + `- [${next.title}](${next.url})` + "\n",
    ""
  );

  markdown(
    (successfulTasks.length > 1
      ? `## 🗂 ${successfulTasks.length} Notion tasks found`
      : "## 🗂 Notion task found") +
      "\n" +
      tasksListStr
  );
};

export default notionTasks;
