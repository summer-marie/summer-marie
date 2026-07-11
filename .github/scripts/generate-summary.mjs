import { readFileSync, writeFileSync } from "node:fs";

const GITHUB_USERNAME = "summer-marie";
const README_PATH = "README.md";
const START_MARKER = "<!--WORKFLOW:START-->";
const END_MARKER = "<!--WORKFLOW:END-->";

const githubToken = process.env.GITHUB_TOKEN;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (!githubToken) throw new Error("Missing GITHUB_TOKEN");
if (!anthropicKey) throw new Error("Missing ANTHROPIC_API_KEY");

async function fetchRecentActivity() {
  const res = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  const events = await res.json();

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter(
    (e) => new Date(e.created_at).getTime() >= sevenDaysAgo
  );

  return recent.map((e) => ({
    type: e.type,
    repo: e.repo?.name,
    created_at: e.created_at,
    commits: e.payload?.commits?.map((c) => c.message).slice(0, 5),
  }));
}

async function summarizeWithClaude(activity) {
  if (activity.length === 0) {
    return "Quiet week on GitHub — no public activity in the last 7 days.";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            "Here is a list of a developer's public GitHub events from the last 7 days (JSON):\n\n" +
            JSON.stringify(activity, null, 2) +
            "\n\nWrite a friendly, 2-3 sentence first-person recap of what she's been working on this week, suitable for a GitHub profile README. No headers, no markdown formatting, just prose. Do not invent details not present in the data.",
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? "Summary unavailable this week.";
}

function updateReadme(summary) {
  const readme = readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Workflow markers not found in README.md");
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const updated = `${before}\n${summary}\n${after}`;

  writeFileSync(README_PATH, updated, "utf8");
}

const activity = await fetchRecentActivity();
const summary = await summarizeWithClaude(activity);
updateReadme(summary);
