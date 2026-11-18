import { isSupabaseConfigured } from "@/shared/api/supabase";
import { getErrorMessage } from "@/shared/lib/error-message";
import {
  addFeedComment,
  createFeedPost,
  deleteFeedComment,
  editFeedComment,
  fetchFeedPost,
  fetchFeedPosts,
  removeFeedAttachment,
  softDeleteFeedPost,
  updateFeedPost,
  uploadFeedAttachment,
  voteFeedPoll,
} from "../api/news-feed-api";
import type { FeedPost, FeedPostInput } from "../model/types";

function feedErrorMessage(error: unknown, fallback: string): string {
  const raw = getErrorMessage(error, fallback);
  if (/could not find the function/i.test(raw) || /PGRST202/i.test(raw)) {
    return "На сервере нет функций ленты. Примените миграцию news_feed_core и обновите schema cache (NOTIFY pgrst, 'reload schema')";
  }
  return raw;
}

export type NewsFeedStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

const PAGE_SIZE = 20;

let posts: FeedPost[] = [];
let status: NewsFeedStatus = "idle";
let loadingMore = false;
let hasMore = false;
let errorMessage: string | null = null;
let canCreate = false;
let isAdminViewer = false;
let loadPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: NewsFeedStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

function upsertPost(post: FeedPost) {
  const index = posts.findIndex((item) => item.id === post.id);
  if (index < 0) {
    posts = [post, ...posts];
  } else {
    posts = posts.map((item) => (item.id === post.id ? post : item));
  }
  notify();
}

function removePost(postId: string) {
  posts = posts.filter((item) => item.id !== postId);
  notify();
}

export function subscribeNewsFeedStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNewsFeedPosts() {
  return posts;
}

export function getNewsFeedStatus() {
  return status;
}

export function getNewsFeedError() {
  return errorMessage;
}

export function getNewsFeedHasMore() {
  return hasMore;
}

export function getNewsFeedLoadingMore() {
  return loadingMore;
}

export function getNewsFeedCanCreate() {
  return canCreate;
}

export function getNewsFeedIsAdminViewer() {
  return isAdminViewer;
}

export async function loadNewsFeed(options?: { force?: boolean }) {
  if (!isSupabaseConfigured) {
    posts = [];
    hasMore = false;
    canCreate = false;
    isAdminViewer = false;
    setStatus("ready");
    return;
  }
  if (loadPromise && !options?.force) return loadPromise;

  loadPromise = (async () => {
    setStatus("loading");
    try {
      const result = await fetchFeedPosts({ limit: PAGE_SIZE });
      posts = result.items;
      hasMore = result.items.length >= PAGE_SIZE;
      canCreate = result.canCreate;
      isAdminViewer = result.isAdmin;
      setStatus("ready");
    } catch (error) {
      setStatus("error", feedErrorMessage(error, "Не удалось загрузить ленту"));
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function loadNewsFeedPost(postId: string): Promise<FeedPost> {
  const existing = posts.find((item) => item.id === postId);
  try {
    const post = await fetchFeedPost(postId);
    upsertPost(post);
    return post;
  } catch (error) {
    if (existing) return existing;
    throw new Error(
      feedErrorMessage(error, "Не удалось загрузить публикацию"),
      { cause: error },
    );
  }
}

export async function loadMoreNewsFeed() {
  if (!isSupabaseConfigured || loadingMore || !hasMore || posts.length === 0) {
    return;
  }
  const before = posts[posts.length - 1]?.createdAt;
  if (!before) return;

  loadingMore = true;
  notify();
  try {
    const result = await fetchFeedPosts({ limit: PAGE_SIZE, before });
    const existing = new Set(posts.map((item) => item.id));
    const appended = result.items.filter((item) => !existing.has(item.id));
    posts = [...posts, ...appended];
    hasMore = result.items.length >= PAGE_SIZE;
    canCreate = result.canCreate;
    isAdminViewer = result.isAdmin;
  } catch (error) {
    errorMessage = feedErrorMessage(error, "Не удалось загрузить ещё");
  } finally {
    loadingMore = false;
    notify();
  }
}

export async function publishNewsFeedPost(
  input: FeedPostInput,
  files: File[] = [],
): Promise<FeedPost> {
  const post = await createFeedPost(input);
  for (let i = 0; i < files.length; i += 1) {
    await uploadFeedAttachment(post.id, files[i]!, i);
  }
  const next = files.length > 0 ? await fetchFeedPost(post.id) : post;
  upsertPost(next);
  canCreate = true;
  notify();
  return next;
}

export async function saveNewsFeedPost(
  postId: string,
  input: FeedPostInput,
  options?: {
    filesToAdd?: File[];
    attachmentIdsToRemove?: string[];
  },
): Promise<FeedPost> {
  for (const attachmentId of options?.attachmentIdsToRemove ?? []) {
    await removeFeedAttachment(attachmentId);
  }
  let post = await updateFeedPost(postId, input);
  const existingCount = post.attachments.length;
  const files = options?.filesToAdd ?? [];
  for (let i = 0; i < files.length; i += 1) {
    await uploadFeedAttachment(postId, files[i]!, existingCount + i);
  }
  if (files.length > 0 || (options?.attachmentIdsToRemove?.length ?? 0) > 0) {
    post = await fetchFeedPost(postId);
  }
  upsertPost(post);
  return post;
}

export async function deleteNewsFeedPost(postId: string): Promise<void> {
  await softDeleteFeedPost(postId);
  removePost(postId);
}

export async function createNewsFeedComment(postId: string, body: string) {
  const comment = await addFeedComment(postId, body);
  posts = posts.map((post) => {
    if (post.id !== postId) return post;
    return {
      ...post,
      comments: [...post.comments, comment],
      commentCount: post.commentCount + 1,
    };
  });
  notify();
  return comment;
}

export async function saveNewsFeedComment(commentId: string, body: string) {
  const comment = await editFeedComment(commentId, body);
  posts = posts.map((post) => ({
    ...post,
    comments: post.comments.map((item) =>
      item.id === commentId ? comment : item,
    ),
  }));
  notify();
  return comment;
}

export async function removeNewsFeedComment(postId: string, commentId: string) {
  await deleteFeedComment(commentId);
  posts = posts.map((post) => {
    if (post.id !== postId) return post;
    const comments = post.comments.filter((item) => item.id !== commentId);
    return {
      ...post,
      comments,
      commentCount: Math.max(0, post.commentCount - 1),
    };
  });
  notify();
}

export async function submitNewsFeedPollVote(
  postId: string,
  pollId: string,
  optionIds: string[],
) {
  const poll = await voteFeedPoll(pollId, optionIds);
  posts = posts.map((post) => (post.id === postId ? { ...post, poll } : post));
  notify();
  return poll;
}
