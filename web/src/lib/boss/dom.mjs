export function readBossDom() {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const nodes = [...document.querySelectorAll(".job-card-wrapper, .job-card-box")];
    if (!nodes.length) {
      for (const anchor of document.querySelectorAll('a[href*="/job_detail/"]')) {
        const card = anchor.closest("li, article, .job-card") || anchor;
        if (!nodes.includes(card)) nodes.push(card);
      }
    }
    const cards = nodes.filter(visible).slice(0, 60).map((card) => {
      const read = (selector) => {
        const element = [...card.querySelectorAll(selector)].find(visible);
        return element?.textContent?.trim() || "";
      };
      const anchor = card.matches('a[href*="/job_detail/"]') ? card : card.querySelector('a[href*="/job_detail/"]');
      const tags = [...card.querySelectorAll(".tag-list li, .job-tag li, .job-info .tag-list span")].filter(visible).map((item) => item.textContent?.trim() || "");
      return {
        href: anchor?.getAttribute("href") || "", title: (anchor?.textContent?.trim() || "") || read(".job-name, .job-title, h3"),
        company: read(".company-name, .boss-name"), location: read(".job-area, .job-area-wrapper, .job-location, .company-location"), salary: read(".salary, .job-salary"),
        experience: tags.find((value) => /经验|\d+[-到]?\d*年|应届|在校/.test(value)) || "",
        education: tags.find((value) => /学历|本科|大专|硕士|博士|高中|中专|初中/.test(value)) || "",
      };
    });
    return { url: location.href, text: document.body?.innerText?.slice(0, 100000) || "", cards };
}
