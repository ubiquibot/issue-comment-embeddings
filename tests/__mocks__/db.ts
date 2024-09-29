// cSpell:disable
import { factory, nullable, primaryKey } from "@mswjs/data";

/**
 * Creates an object that can be used as a db to persist data within tests
 */
export const db = factory({
  users: {
    id: primaryKey(Number),
    login: String,
    avatar_url: nullable(String), // Add any additional fields based on the schema
  },
  repo: {
    id: primaryKey(Number),
    name: String,
    full_name: String, // Assuming full_name is needed for repo
    private: Boolean,
    owner: {
      login: String,
      id: Number,
      avatar_url: nullable(String),
    },
    html_url: String,
    description: nullable(String),
    fork: Boolean,
    url: String,
    forks_url: String,
    keys_url: String,
    collaborators_url: String,
    teams_url: String,
    hooks_url: String,
    issue_events_url: String,
    events_url: String,
    assignees_url: String,
    branches_url: String,
    tags_url: String,
    blobs_url: String,
    git_tags_url: String,
    git_refs_url: String,
    trees_url: String,
    statuses_url: String,
    languages_url: String,
    stargazers_url: String,
    contributors_url: String,
    subscribers_url: String,
    subscription_url: String,
    commits_url: String,
    git_commits_url: String,
    comments_url: String,
    issue_comment_url: String,
    contents_url: String,
    compare_url: String,
    merges_url: String,
    archive_url: String,
    downloads_url: String,
    issues_url: String,
    pulls_url: String,
    milestones_url: String,
    notifications_url: String,
    labels_url: String,
    releases_url: String,
    deployments_url: String,
  },
  issue: {
    id: primaryKey(Number),
    number: Number,
    title: String,
    body: String,
    user: {
      login: String,
      id: Number,
    },
    owner: String,
    repo: String,
    author_association: String,
    created_at: Date,
    updated_at: Date,
    comments: Number,
    labels: Array,
    state: String,
    locked: Boolean,
    assignee: nullable({
      login: String,
      id: Number,
      avatar_url: nullable(String),
      email: nullable(String),
      events_url: String,
      followers_url: String,
      following_url: String,
      gists_url: String,
      gravatar_id: nullable(String),
      html_url: String,
      name: nullable(String),
      node_id: String,
      organizations_url: String,
      received_events_url: String,
      repos_url: String,
      site_admin: Boolean,
      starred_at: String,
      starred_url: String,
      subscriptions_url: String,
      type: String,
      url: String,
    }),
    milestone: nullable({
      title: String,
      description: nullable(String),
      due_on: nullable(Date),
      number: Number,
      state: String,
    }),
    reactions: {
      url: String,
      total_count: Number,
      "+1": Number,
      "-1": Number,
      laugh: Number,
      hooray: Number,
      confused: Number,
      heart: Number,
      rocket: Number,
      eyes: Number,
    },
    timeline_url: String,
    performed_via_github_app: nullable(Object),
    state_reason: nullable(String),
  },
  issueComments: {
    id: primaryKey(Number),
    body: String,
    created_at: Date,
    updated_at: Date,
    node_id: String,
    issue_number: Number,
    user: {
      login: String,
      id: Number,
    },
    author_association: String,
    html_url: String,
    issue_url: String,
  },
});
