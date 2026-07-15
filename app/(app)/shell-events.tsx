"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Ports crm-ui/index.html's event-delegation pattern: one document click
// listener drives both the reading pane (data-url, same as the prototype's
// openBrowser()) and client-side nav (data-href, router.push instead of
// location.hash). This is what lets every later page render plain
// `<button data-url=...>` / `<tr data-href=...>` markup with zero per-row
// React state — same DOM contract as the prototype, different renderer.
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
        openBrowser(src.dataset.url!);
        return;
      }
      const row = target.closest<HTMLElement>("[data-href]");
      if (row) {
        router.push(row.dataset.href!);
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeBrowser();
    }
    function onUrlKeydown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        let u = bpUrl.value.trim();
        if (u && !/^https?:\/\//.test(u)) u = "https://" + u;
        bpUrl.value = u;
        bpFrame.src = u;
      }
    }
    function onExtClick() {
      if (bpUrl.value) window.open(bpUrl.value, "_blank");
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

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    bpClose.addEventListener("click", closeBrowser);
    bpExt.addEventListener("click", onExtClick);
    bpUrl.addEventListener("keydown", onUrlKeydown);
    bpHandle.addEventListener("mousedown", onHandleMousedown);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      bpClose.removeEventListener("click", closeBrowser);
      bpExt.removeEventListener("click", onExtClick);
      bpUrl.removeEventListener("keydown", onUrlKeydown);
      bpHandle.removeEventListener("mousedown", onHandleMousedown);
    };
  }, [router]);

  return null;
}
