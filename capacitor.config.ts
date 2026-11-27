import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cyberashna.habitplanner",
  appName: "Habit Care Planner",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    backgroundColor: "#f8fafc",
  },
};

export default config;
