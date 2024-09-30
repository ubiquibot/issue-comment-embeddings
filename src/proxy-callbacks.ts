import { createCommentEmbedding } from "./handlers/create-comment-embedding";
import { addTaskEmbedding } from "./handlers/create-task-embedding";
import { deleteCommentEmbedding } from "./handlers/delete-comment-embedding";
import { deleteTaskEmbedding } from "./handlers/delete-task-embedding";
import { issueMatching } from "./handlers/issue-matching";
import { taskSimilaritySearch } from "./handlers/task-deduplication";
import { updateCommentEmbedding } from "./handlers/update-comment-embedding";
import { updateTaskEmbedding } from "./handlers/update-task-embedding";
import { Context, SupportedEvents, SupportedEventsU } from "./types";

export type CallbackResult = { statusCode: 200 | 201 | 204 | 404 | 500; message?: string; content?: string | Record<string, unknown> };

/**
 * The `Context` type is a generic type defined as `Context<TEvent, TPayload>`,
 * where `TEvent` is a string representing the event name (e.g., "issues.labeled")
 * and `TPayload` is the webhook payload type for that event, derived from
 * the `SupportedEvents` type map.
 *
 * The `ProxyCallbacks` object is cast to allow optional callbacks
 * for each event type. This is useful because not all events may have associated callbacks.
 * As opposed to Partial<ProxyCallbacks> which could mean an undefined object.
 *
 * The expected function signature for callbacks looks like this:
 *
 * ```typescript
 * fn(context: Context<"issues.labeled", SupportedEvents["issues.labeled"]>): Promise<CallbackResult>
 * ```
 */

export type ProxyCallbacks = {
  [K in SupportedEventsU]: Array<(context: Context<K, SupportedEvents[K]>) => Promise<CallbackResult>>;
};

/**
 * The `callbacks` object defines an array of callback functions for each supported event type.
 *
 * Since multiple callbacks might need to be executed for a single event, we store each
 * callback in an array. This design allows for extensibility and flexibility, enabling
 * us to add more callbacks for a particular event without modifying the core logic.
 */
const callbacks = {
  "issue_comment.created": [createCommentEmbedding],
  "issue_comment.edited": [updateCommentEmbedding],
  "issue_comment.deleted": [deleteCommentEmbedding],

  "issues.opened": [addTaskEmbedding, taskSimilaritySearch, issueMatching],
  "issues.edited": [updateTaskEmbedding, taskSimilaritySearch, issueMatching],
  "issues.deleted": [deleteTaskEmbedding],
} as ProxyCallbacks;

/**
 * 

  } else if (isIssueEvent(context)) {
    switch (eventName) {
      case "issues.opened":
        await issueChecker(context);
        await addIssue(context);
        return await issueMatching(context);
      case "issues.edited":
        await issueChecker(context);
        await updateIssue(context);
        return await issueMatching(context);
      case "issues.deleted":
        return await deleteIssues(context);
    }
  } else if (eventName == "issues.labeled") {
    return await issueMatching(context);
  } else {
    logger.error(`Unsupported event: ${eventName}`);
 * @returns 
 */

/**
 * The `proxyCallbacks` function returns a Proxy object that intercepts access to the
 * `callbacks` object. This Proxy enables dynamic handling of event callbacks, including:
 *
 * - **Event Handling:** When an event occurs, the Proxy looks up the corresponding
 *   callbacks in the `callbacks` object. If no callbacks are found for the event,
 *   it returns a `skipped` status.
 *
 * - **Error Handling:** If an error occurs while processing a callback, the Proxy
 *   logs the error and returns a `failed` status.
 *
 * The Proxy uses the `get` trap to intercept attempts to access properties on the
 * `callbacks` object. This trap allows us to asynchronously execute the appropriate
 * callbacks based on the event type, ensuring that the correct context is passed to
 * each callback.
 */
export function proxyCallbacks(context: Context): ProxyCallbacks {
  return new Proxy(callbacks, {
    get(target, prop: SupportedEventsU) {
      if (!target[prop]) {
        context.logger.info(`No callbacks found for event ${prop}`);
        return { statusCode: 204, reason: "skipped" };
      }
      return (async () => {
        try {
          return await Promise.all(target[prop].map((callback) => handleCallback(callback, context)));
        } catch (er) {
          context.logger.error(`Failed to handle event ${prop}`, { er });
          return { statusCode: 500, reason: "failed" };
        }
      })();
    },
  });
}

/**
 * Why do we need this wrapper function?
 *
 * By using a generic `Function` type for the callback parameter, we bypass strict type
 * checking temporarily. This allows us to pass a standard `Context` object, which we know
 * contains the correct event and payload types, to the callback safely.
 *
 * We can trust that the `ProxyCallbacks` type has already ensured that each callback function
 * matches the expected event and payload types, so this function provides a safe and
 * flexible way to handle callbacks without introducing type or logic errors.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function handleCallback(callback: Function, context: Context) {
  return callback(context);
}
