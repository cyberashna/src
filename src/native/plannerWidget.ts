import { Capacitor, registerPlugin } from "@capacitor/core";

type NativePlannerLaunchTarget = "widget" | "today" | "quick-note";

type PlannerWidgetSnapshot = {
  title: string;
  status: string;
  waitingLabel: string;
  updatedAt: string;
};

type PlannerWidgetPlugin = {
  updateSnapshot(snapshot: PlannerWidgetSnapshot): Promise<void>;
  getLaunchTarget(): Promise<{ target?: string | null }>;
};

const PlannerWidget = registerPlugin<PlannerWidgetPlugin>("PlannerWidget");

export const updateNativePlannerWidget = async (snapshot: PlannerWidgetSnapshot) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await PlannerWidget.updateSnapshot(snapshot);
  } catch (error) {
    console.warn("Unable to update native planner widget", error);
  }
};

export const getNativePlannerLaunchTarget = async (): Promise<NativePlannerLaunchTarget | null> => {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { target } = await PlannerWidget.getLaunchTarget();
    return target === "widget" || target === "today" || target === "quick-note" ? target : null;
  } catch (error) {
    console.warn("Unable to read native planner launch target", error);
    return null;
  }
};
