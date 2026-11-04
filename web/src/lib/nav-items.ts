import { LayoutDashboard, Compass, ListChecks, Send, Radar, BarChart3, FileText, Files, Settings, CalendarClock, Bot, GraduationCap } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "今日概览", icon: LayoutDashboard },
  { href: "/explore", label: "Boss 找工作", icon: Compass, chip: "新" },
  { href: "/pipeline", label: "求职进展", icon: ListChecks },
  { href: "/followups", label: "后续跟进", icon: Send },
  { href: "/analytics", label: "数据分析", icon: BarChart3 },
  { href: "/market", label: "市场与职业建议", icon: Radar, chip: "新" },
  { href: "/agent", label: "常驻求职助手", icon: Bot, chip: "新" },
  { href: "/interviews", label: "面试日程与通知", icon: CalendarClock },
  { href: "/interview-coach", label: "面试训练", icon: GraduationCap },
  { href: "/cv", label: "我的简历", icon: FileText },
  { href: "/boss-resumes", label: "岗位定制简历", icon: Files, chip: "新" },
  { href: "/documents", label: "文档", icon: Files },
  { href: "/config", label: "设置", icon: Settings },
];

export function visibleNavItems(followupsEnabled: boolean): NavItem[] {
  return followupsEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/followups");
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
