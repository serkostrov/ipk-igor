import { useSyncExternalStore } from "react";
import {
  getMyOpenAutomationTaskCount,
  subscribeMyOpenAutomationTaskCount,
} from "../model/my-open-tasks-count-store";

export function useMyOpenAutomationTaskCount() {
  return useSyncExternalStore(
    subscribeMyOpenAutomationTaskCount,
    getMyOpenAutomationTaskCount,
    getMyOpenAutomationTaskCount,
  );
}
