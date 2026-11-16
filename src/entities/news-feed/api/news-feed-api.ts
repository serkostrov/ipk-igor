import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  assertFeedFileAllowed,
  getFeedFileExtension,
} from "../lib/file-policy";
import {
  normalizeFeedAttachment,
  normalizeFeedComment,
  normalizeFeedPoll,
  normalizeFeedPost,
  type FeedAttachment,
  type FeedComment,
  type FeedPoll,
  type FeedPost,
  type FeedPostInput,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

function pollToJson(poll: FeedPostInput["poll"]) {
  if (!poll) return null;
  return {
    question: poll.question,
    allow_multiple: poll.allowMultiple,
    ends_at: poll.endsAt,
    options: poll.options.map((label) => ({ label })),
  };
}

function linksToJson(links: FeedPostInput["links"]) {
  return links.map((link) => ({
    kind: link.kind,
    url: link.url,
    title: link.title,
  }));
}

export async function fetchFeedPosts(input?: {
  limit?: number;
  before?: string | null;
}): Promise<{ items: FeedPost[]; canCreate: boolean; isAdmin: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    return { items: [], canCreate: false, isAdmin: false };
  }
  const client = requireClient();
  const params: { p_limit: number; p_before?: string } = {
    p_limit: input?.limit ?? 20,
  };
  if (input?.before) params.p_before = input.before;
  const { data, error } = await client.rpc("feed_list_posts", params);
  if (error) throw error;
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const itemsRaw = Array.isArray(root.items) ? root.items : [];
  const items: FeedPost[] = [];
  for (const item of itemsRaw) {
    const parsed = normalizeFeedPost(item);
    if (parsed) items.push(parsed);
  }
  const viewer =
    root.viewer && typeof root.viewer === "object"
      ? (root.viewer as Record<string, unknown>)
      : {};
  return {
    items,
    canCreate: viewer.can_create === true,
    isAdmin: viewer.is_admin === true,
  };
}

export async function fetchFeedPost(postId: string): Promise<FeedPost> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_get_post", { p_id: postId });
  if (error) throw error;
  const post = normalizeFeedPost(data);
  if (!post) throw new Error("Публикация недоступна");
  return post;
}

export async function createFeedPost(input: FeedPostInput): Promise<FeedPost> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_create_post", {
    p_title: input.title,
    p_body: input.body,
    p_targets_all: input.targetsAll,
    p_legal_entity_ids: input.legalEntityIds,
    p_links: linksToJson(input.links),
    p_poll: pollToJson(input.poll),
  });
  if (error) throw error;
  const post = normalizeFeedPost(data);
  if (!post) throw new Error("Не удалось создать публикацию");
  return post;
}

export async function updateFeedPost(
  postId: string,
  input: FeedPostInput,
): Promise<FeedPost> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_update_post", {
    p_id: postId,
    p_title: input.title,
    p_body: input.body,
    p_targets_all: input.targetsAll,
    p_legal_entity_ids: input.legalEntityIds,
    p_links: linksToJson(input.links),
    p_poll: pollToJson(input.poll),
    p_keep_poll: input.keepPoll === true,
  });
  if (error) throw error;
  const post = normalizeFeedPost(data);
  if (!post) throw new Error("Не удалось сохранить публикацию");
  return post;
}

export async function softDeleteFeedPost(postId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("feed_soft_delete_post", { p_id: postId });
  if (error) throw error;
}

export async function uploadFeedAttachment(
  postId: string,
  file: File,
  sortOrder = 0,
): Promise<FeedAttachment> {
  assertFeedFileAllowed(file);
  const client = requireClient();
  const extension = getFeedFileExtension(file.name);
  const objectName = `${postId}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const { error: uploadError } = await client.storage
    .from("feed-files")
    .upload(objectName, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await client.rpc("feed_add_attachment", {
    p_post_id: postId,
    p_file_name: file.name,
    p_extension: extension,
    p_size_bytes: file.size,
    p_mime_type: file.type || "application/octet-stream",
    p_storage_path: objectName,
    p_sort_order: sortOrder,
  });
  if (error) throw error;
  const attachment = normalizeFeedAttachment(data);
  if (!attachment) throw new Error("Не удалось сохранить вложение");
  return attachment;
}

export async function removeFeedAttachment(
  attachmentId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("feed_remove_attachment", {
    p_attachment_id: attachmentId,
  });
  if (error) throw error;
}

export async function getFeedFileUrl(storagePath: string): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from("feed-files")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Не удалось получить ссылку на файл");
  return data.signedUrl;
}

export async function addFeedComment(
  postId: string,
  body: string,
): Promise<FeedComment> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_add_comment", {
    p_post_id: postId,
    p_body: body,
  });
  if (error) throw error;
  const comment = normalizeFeedComment(data);
  if (!comment) throw new Error("Не удалось добавить комментарий");
  return comment;
}

export async function editFeedComment(
  commentId: string,
  body: string,
): Promise<FeedComment> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_edit_comment", {
    p_comment_id: commentId,
    p_body: body,
  });
  if (error) throw error;
  const comment = normalizeFeedComment(data);
  if (!comment) throw new Error("Не удалось сохранить комментарий");
  return comment;
}

export async function deleteFeedComment(commentId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("feed_delete_comment", {
    p_comment_id: commentId,
  });
  if (error) throw error;
}

export async function voteFeedPoll(
  pollId: string,
  optionIds: string[],
): Promise<FeedPoll> {
  const client = requireClient();
  const { data, error } = await client.rpc("feed_vote_poll", {
    p_poll_id: pollId,
    p_option_ids: optionIds,
  });
  if (error) throw error;
  const poll = normalizeFeedPoll(data);
  if (!poll) throw new Error("Не удалось сохранить голос");
  return poll;
}
