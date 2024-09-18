import { CallbackResult } from "../../proxy-callbacks";
import { Context } from "../../types";

/**
 * Will create embeddings for any .md files found in the repository.
 * Would benefit from a structured schema, but most of our readmes are
 * pretty uniform anyway.
 * 
 * Storage schema looks like:
 * 
 * ```json
 * {
 *  "sourceId": "owner/repo/file.md",
 *  "type": "setup_instructions",
 *  "plaintext": "file content",
 * "metadata": {
 * "author_association": "OWNER",
 * "author_id": 123456,
 */
export async function handleRepoDocuments(context: Context<"push">): Promise<CallbackResult> {
    const {
        logger,
        octokit,
        adapters: { supabase },
        payload: { repository, commits, sender, pusher }
    } = context;

    const docs = []

    for (const commit of commits) {
        const { added, modified } = commit;
        const files = []

        if (added && added.length > 0) {
            files.push(...added)
        }
        if (modified && modified.length > 0) {
            files.push(...modified)
        }

        for (const file of files) {
            if (file.endsWith(".md")) {
                docs.push(file)
            }
        }
    }

    if (docs.length === 0) {
        return { status: 200, reason: "no markdown files found" };
    }

    logger.info(`Found ${docs.length} markdown files`);
    if (!repository.owner || !repository.name) {
        return { status: 200, reason: "no repository owner or name found" };
    }

    /**
     * voyageai uses a special encoding schema and we cannot easily
     * use their encoder so we will just have to play it by ear for now.
     */
    for (const doc of docs) {
        const sourceId = repository.full_name + "/" + doc;
        const docContent = await octokit.repos.getContent({
            owner: repository.owner.login,
            repo: repository.name,
            path: doc,
            mediaType: {
                format: "raw",
            }
        });

        if (!docContent.data) {
            return { status: 200, reason: "no content found" };
        }

        const text = docContent.data as unknown as string;

        const uploaded = await supabase.embeddings.createEmbedding(sourceId, "setup_instructions", text, {
            isPrivate: repository.private,
            repo_node_id: repository.node_id,
            repo_full_name: repository.full_name,
            filePath: doc,
            fileChunkIndex: 0,
        });

        logger.info("Uploaded markdown file", { ...uploaded, embedding: "removed for brevity" });
    }

    logger.ok("Successfully uploaded setup instructions", { repository: repository.full_name });

    return { status: 200, reason: "success" };
}
