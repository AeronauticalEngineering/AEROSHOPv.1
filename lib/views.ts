import { PRIMARY_VIEWS, VIEW_COLUMNS } from "@/lib/config";
import type { ViewConfig } from "@/lib/types";

export function getViewById(id: string): ViewConfig | undefined {
  return PRIMARY_VIEWS.find(view => view.id === id) as ViewConfig | undefined;
}

export function getViewColumns(viewName: string, fallback: string[] = []) {
  return VIEW_COLUMNS[viewName] || fallback;
}
