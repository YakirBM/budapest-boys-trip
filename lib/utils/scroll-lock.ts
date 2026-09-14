let lockCount = 0;
let previousOverflow = "";

/**
 * Reference-counted document scroll lock. Multiple stacked dialogs can now
 * close independently without leaving the page frozen (or unlocking it too
 * early while another dialog is still open).
 */
export function lockDocumentScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;

  if (lockCount === 0) {
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = previousOverflow;
      previousOverflow = "";
    }
  };
}
