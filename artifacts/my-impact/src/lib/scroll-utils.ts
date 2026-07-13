export const CONTENT_SCROLL_ID = "main-content-scroll";

export function scrollContentToTop(behavior: ScrollBehavior = "instant"): void {
  const el = document.getElementById(CONTENT_SCROLL_ID);
  if (el) {
    el.scrollTo({ top: 0, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}
