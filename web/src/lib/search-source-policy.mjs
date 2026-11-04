// This installation opts into a single source through its service environment.
export function bossOnlySearch(env = process.env) {
  return env.CAREER_OPS_SEARCH_SOURCE === 'boss';
}
export function bossOnlyResponse() {
  return Response.json({ code: 'BOSS_ONLY', error: '此版本仅使用 Boss 直聘，请在“Boss 找工作”页面搜索岗位。' }, { status: 409 });
}
