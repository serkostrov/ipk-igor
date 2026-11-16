import { useSyncExternalStore } from "react";
import {
  getNewsFeedCanCreate,
  getNewsFeedError,
  getNewsFeedHasMore,
  getNewsFeedIsAdminViewer,
  getNewsFeedLoadingMore,
  getNewsFeedPosts,
  getNewsFeedStatus,
  subscribeNewsFeedStore,
} from "../store/news-feed-store";

export function useNewsFeedStatus() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedStatus,
    getNewsFeedStatus,
  );
}

export function useNewsFeedError() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedError,
    getNewsFeedError,
  );
}

export function useNewsFeedPosts() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedPosts,
    getNewsFeedPosts,
  );
}

export function useNewsFeedHasMore() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedHasMore,
    getNewsFeedHasMore,
  );
}

export function useNewsFeedLoadingMore() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedLoadingMore,
    getNewsFeedLoadingMore,
  );
}

export function useNewsFeedCanCreate() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedCanCreate,
    getNewsFeedCanCreate,
  );
}

export function useNewsFeedIsAdminViewer() {
  return useSyncExternalStore(
    subscribeNewsFeedStore,
    getNewsFeedIsAdminViewer,
    getNewsFeedIsAdminViewer,
  );
}
