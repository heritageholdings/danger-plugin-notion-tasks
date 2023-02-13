import { defaultTriggerWords, parseNotionLinks, parseTaskIdFromUrl } from "./";

const notionUser = "user";
const notionTaskId1 = "c0576df13d2748b78faee31e0c614e0d";
const notionTaskId2 = "z011s6df13d21d8b78ffee31eac6fg14e0d";
const notionTaskUrl1 = `https://www.notion.so/${notionUser}/Make-the-KYC-initial-content-smaller-and-in-italic-${notionTaskId1}`;
const notionTaskUrl2 = `https://www.notion.so/${notionUser}/Make2-the-KYC-initial-content-smaller-and-in-italic-${notionTaskId2}`;

describe("notionSync", () => {
  describe("parseNotionLinks", () => {
    test.each([
      ["", []],
      [`this PR solves ${notionTaskUrl1}`, []],
      [`this PR resolves ${notionTaskUrl1}`, [`resolves ${notionTaskUrl1}`]],
      [
        `this PR resolves        ${notionTaskUrl1}`,
        [`resolves        ${notionTaskUrl1}`],
      ],
      [`this PR ResoLves ${notionTaskUrl1}`, [`ResoLves ${notionTaskUrl1}`]],
      [
        `this PR fixes ${notionTaskUrl1}\n and closes ${notionTaskUrl2}`,
        [`fixes ${notionTaskUrl1}`, `closes ${notionTaskUrl2}`],
      ],
    ])("%p -> %p", (input, expected) => {
      const output = parseNotionLinks(notionUser, defaultTriggerWords, input);
      expect(output).toMatchObject(expected);
    });
  });

  describe("parseTaskIdFromUrl", () => {
    test.each([
      ["", null],
      [notionTaskUrl1, notionTaskId1],
      [notionTaskUrl2, notionTaskId2],
    ])("%p -> %p", (input, expected) => {
      const output = parseTaskIdFromUrl(input);
      expect(output).toBe(expected);
    });
  });
});
