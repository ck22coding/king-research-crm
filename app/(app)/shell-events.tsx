"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Ports crm-ui/index.html's event-delegation pattern: one document click
// listener drives both the reading pane (data-url, same as the prototype's
// openBrowser()) and client-side nav (data-href, router.push instead of
// location.hash). This is what lets every later page render plain
// `<button data-url=...>` / `<tr data-href=...>` markup with zero per-row
// React state — same DOM contract as the prototype, different renderer.
// Reading-pane URLs come from the facts/sources tables — DB rows, not code.
// A poisoned sources.url ("javascript:...") must never reach the iframe or
// window.open, so only http(s) survives.
function safeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export default function ShellEvents() {
  const router = useRouter();
  const pathname = usePathname();

  // Active nav-item highlight — cheap port of the prototype's render()
  // doing `nav-item.classList.toggle("active", ...)` on every route change.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".nav-item[data-href]").forEach((el) => {
      const href = el.dataset.href!;
      el.classList.toggle("active", pathname === href || pathname.startsWith(href + "/"));
    });
  }, [pathname]);

  useEffect(() => {
    const bp = document.getElementById("browser") as HTMLElement;
    const bpHandle = document.getElementById("bpHandle") as HTMLElement;
    const bpFrame = document.getElementById("bpFrame") as HTMLIFrameElement;
    const bpUrl = document.getElementById("bpUrl") as HTMLInputElement;
    const bpClose = document.getElementById("bpClose") as HTMLElement;
    const bpExt = document.getElementById("bpExt") as HTMLElement;
    if (!bp || !bpHandle || !bpFrame || !bpUrl || !bpClose || !bpExt) return;

    function openBrowser(url: string) {
      bp.hidden = false;
      bpHandle.hidden = false;
      bpUrl.value = url;
      if (bpFrame.src !== url) bpFrame.src = url;
    }
    function closeBrowser() {
      bp.hidden = true;
      bpHandle.hidden = true;
      bpFrame.src = "about:blank";
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const src = target.closest<HTMLElement>("[data-url]");
      if (src) {
        const url = safeHttpUrl(src.dataset.url);
        if (url) openBrowser(url);
        return;
      }
      const row = target.closest<HTMLElement>("[data-href]");
      if (row) {
        router.push(row.dataset.href!);
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeBrowser();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("q")?.focus();
      }
    }
    function onUrlKeydown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        let u = bpUrl.value.trim();
        if (u && !/^https?:\/\//.test(u)) u = "https://" + u;
        const safe = safeHttpUrl(u);
        if (!safe) return;
        bpUrl.value = safe;
        bpFrame.src = safe;
      }
    }
    function onExtClick() {
      const safe = safeHttpUrl(bpUrl.value);
      if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    }
    function onHandleMousedown() {
      document.body.classList.add("dragging");
      const move = (ev: MouseEvent) => {
        const w = Math.min(Math.max(window.innerWidth - ev.clientX, 320), window.innerWidth * 0.7);
        document.documentElement.style.setProperty("--bp-w", w + "px");
      };
      const up = () => {
        document.body.classList.remove("dragging");
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }

    // Tooltip: ports the prototype's #tooltip mouseover/mousemove pair —
    // any element with data-tip shows its text next to the cursor.
    const tip = document.getElementById("tooltip") as HTMLElement | null;
    function onMouseover(e: MouseEvent) {
      if (!tip) return;
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!t) {
        tip.hidden = true;
        return;
      }
      tip.textContent = t.dataset.tip ?? "";
      tip.hidden = false;
    }
    function onMousemove(e: MouseEvent) {
      if (!tip || tip.hidden) return;
      const pad = 12;
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX + pad, window.innerWidth - r.width - 8) + "px";
      tip.style.top = Math.min(e.clientY + pad, window.innerHeight - r.height - 8) + "px";
    }

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mouseover", onMouseover);
    document.addEventListener("mousemove", onMousemove);
    bpClose.addEventListener("click", closeBrowser);
    bpExt.addEventListener("click", onExtClick);
    bpUrl.addEventListener("keydown", onUrlKeydown);
    bpHandle.addEventListener("mousedown", onHandleMousedown);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("mouseover", onMouseover);
      document.removeEventListener("mousemove", onMousemove);
      bpClose.removeEventListener("click", closeBrowser);
      bpExt.removeEventListener("click", onExtClick);
      bpUrl.removeEventListener("keydown", onUrlKeydown);
      bpHandle.removeEventListener("mousedown", onHandleMousedown);
    };
  }, [router]);

  return null;
}
