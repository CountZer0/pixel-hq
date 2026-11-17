// Pixel HQ Keymap & Workspace Switcher
// Instant switching between spaces/floors and one-click hotkey configuration.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, run, theme, props, closeOverlay, readTextFile, writeTextFile } from "herdr";

const PRESETS = {
  vscode: {
    name: "VS Code / Fast Nav (Recommended)",
    desc: "Ctrl+P for Switcher, Alt+[ and Alt+] for prev/next space",
    keys: {
      "ctrl-p": "mod.open:company-keymap",
      "alt-[": "space.prev",
      "alt-]": "space.next",
    },
  },
  tmux: {
    name: "Tmux Style",
    desc: "Ctrl+B for Switcher, Alt+J and Alt+K for next/prev space",
    keys: {
      "ctrl-b": "mod.open:company-keymap",
      "alt-j": "space.next",
      "alt-k": "space.prev",
    },
  },
  defaults: {
    name: "Herdr Defaults",
    desc: "Ctrl+Shift+K for picker, Ctrl+Shift+PageDown/Up for spaces",
    keys: {
      "ctrl-p": "app.palette",
      "ctrl-shift-pagedown": "space.next",
      "ctrl-shift-pageup": "space.prev",
    },
  },
};

export default class CompanyKeymap extends View {
  init(_props, cx) {
    this.tab = "switcher";
    this.filter = "";
    this.selected = 0;
    this.notice = null;
    this.loading = false;

    this.input = InputState.new({ placeholder: "Search workspace / floor, or press 1-9 to jump…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value().toLowerCase().trim();
      this.selected = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.switchCurrent(cx));

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.focus();
    cx.timer.after(250, () => this.input.focus());
  }

  filteredSpaces() {
    const all = spaces() ?? [];
    if (!this.filter) return all;
    return all.filter((s, i) => {
      const name = (s.name ?? "").toLowerCase();
      const folder = (s.folder ?? "").toLowerCase();
      const num = String(i + 1);
      return name.includes(this.filter) || folder.includes(this.filter) || num === this.filter;
    });
  }

  switchCurrent(cx) {
    const list = this.filteredSpaces();
    if (list.length > 0 && list[this.selected]) {
      run("space.select", { id: list[this.selected].id });
      closeOverlay(props()?.overlay);
    } else if (cx) {
      cx.notify();
    }
  }

  async applyPreset(presetKey, cx) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    this.loading = true;
    this.notice = "Applying preset…";
    cx.notify();

    try {
      const raw = await readTextFile("keys.json").catch(() => null);
      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = {}; }
      }
      data.global = data.global ?? {};
      data.terminal = data.terminal ?? {};

      for (const [key, action] of Object.entries(preset.keys)) {
        data.global[key] = action;
        data.terminal[key] = action;
      }

      const nextRaw = JSON.stringify(data, null, 2) + "\n";
      await writeTextFile("keys.json", nextRaw, raw);
      this.notice = `Applied: ${preset.name}! Updated live in keys.json.`;
    } catch (err) {
      this.notice = `Error saving keys: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      cx.notify();
    }
  }

  render(cx) {
    const t = theme();
    const list = this.filteredSpaces();
    const agList = agents() ?? [];
    const crewMap = new Map();
    for (const a of agList) {
      if (!crewMap.has(a.space)) crewMap.set(a.space, []);
      crewMap.get(a.space).push(a);
    }

    const tabBtn = (id, label, icon) => {
      const on = this.tab === id;
      return h_flex()
        .id(`tab-${id}`)
        .h(28)
        .px(12)
        .gap(6)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .bg(on ? "#313244" : "transparent")
        .text_color(on ? "#89b4fa" : "#a6adc8")
        .font_medium()
        .hover((s) => s.bg(on ? "#313244" : "#ffffff10").text_color("#cdd6f4"))
        .on_click(() => {
          this.tab = id;
          if (id === "switcher") cx.timer.after(100, () => this.input.focus());
          cx.notify();
        })
        .child(label);
    };

    return v_flex()
      .id("company-keymap")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          closeOverlay(props()?.overlay);
          cx.stop_propagation();
          return;
        }

        if (this.tab === "switcher") {
          if (e.key === "down" || e.key === "arrow_down") {
            this.selected = (this.selected + 1) % Math.max(1, list.length);
            cx.stop_propagation();
            cx.notify();
            return;
          }
          if (e.key === "up" || e.key === "arrow_up") {
            this.selected = (this.selected - 1 + Math.max(1, list.length)) % Math.max(1, list.length);
            cx.stop_propagation();
            cx.notify();
            return;
          }
          if (e.key === "enter") {
            this.switchCurrent(cx);
            cx.stop_propagation();
            return;
          }
          if (!this.filter && /^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key, 10) - 1;
            const all = spaces() ?? [];
            if (all[idx]) {
              run("space.select", { id: all[idx].id });
              closeOverlay(props()?.overlay);
              cx.stop_propagation();
              return;
            }
          }
        }
      })
      .size_full()
      .min_h(0)
      .p(16)
      .gap(12)
      .bg("#181825")
      .rounded(14)
      .border_1()
      .border_color("#ffffff14")
      .text_size(13)
      .child(
        h_flex()
          .h(32)
          .items_center()
          .justify_between()
          .child(
            h_flex()
              .gap(8)
              .items_center()
              .child(
                h_flex()
                  .size(24)
                  .rounded(6)
                  .bg("#89b4fa22")
                  .items_center()
                  .justify_center()
                  .child(div().text_size(12).font_bold().text_color("#89b4fa").child("⌘")),
              )
              .child(
                div()
                  .text_size(14)
                  .font_semibold()
                  .text_color("#cdd6f4")
                  .child("Pixel HQ Switcher & Hotkeys"),
              ),
          )
          .child(
            h_flex()
              .gap(6)
              .child(tabBtn("switcher", "Switch Floors", "layers"))
              .child(tabBtn("hotkeys", "Hotkey Presets", "keyboard"))
              .child(
                div()
                  .id("btn-esc")
                  .px(7)
                  .py(2)
                  .rounded(5)
                  .text_size(11)
                  .text_color("#6c7086")
                  .cursor_pointer()
                  .hover((s) => s.bg("#ffffff14").text_color("#cdd6f4"))
                  .on_click(() => closeOverlay(props()?.overlay))
                  .child("Esc"),
              ),
          ),
      )
      .when(this.tab === "switcher", (el) =>
        el
          .child(
            Input.new(this.input)
              .h(36)
              .flex_none()
              .px(10)
              .rounded(8)
              .border_1()
              .border_color("#89b4fa")
              .bg("#1e1e2e")
              .text_size(12.8)
              .text_color("#cdd6f4"),
          )
          .child(
            v_flex()
              .flex_1()
              .min_h(0)
              .overflow_y_scrollbar()
              .py(2)
              .gap(6)
              .children(
                list.map((s, i) => {
                  const on = s.active;
                  const isSel = this.selected === i;
                  const crew = crewMap.get(s.id) ?? [];
                  const working = crew.filter((a) => a.status === "working").length;
                  const blocked = crew.filter((a) => a.status === "blocked").length;
                  const dotColor = blocked > 0 ? "#f38ba8" : working > 0 ? "#89b4fa" : "#a6e3a1";

                  return h_flex()
                    .id(`space-row-${s.id}`)
                    .h(42)
                    .px(10)
                    .rounded(8)
                    .items_center()
                    .justify_between()
                    .cursor_pointer()
                    .bg(isSel ? "#313244" : on ? "#ffffff0c" : "transparent")
                    .border_1()
                    .border_color(isSel ? "#89b4fa66" : on ? "#89b4fa33" : "transparent")
                    .hover((st) => st.bg("#313244"))
                    .on_click(() => {
                      run("space.select", { id: s.id });
                      closeOverlay(props()?.overlay);
                    })
                    .child(
                      h_flex()
                        .gap(10)
                        .items_center()
                        .child(
                          h_flex()
                            .h(22)
                            .px(7)
                            .rounded(5)
                            .bg("#1e1e2e")
                            .border_1()
                            .border_color("#ffffff14")
                            .items_center()
                            .justify_center()
                            .child(
                              div()
                                .text_size(11)
                                .font_bold()
                                .text_color("#89b4fa")
                                .child(`Floor ${i + 1}`),
                            ),
                        )
                        .child(
                          v_flex()
                            .gap(1)
                            .child(
                              h_flex()
                                .gap(8)
                                .items_center()
                                .child(
                                  div()
                                    .text_size(13)
                                    .font_medium()
                                    .text_color("#cdd6f4")
                                    .child(s.name ?? "unnamed"),
                                )
                                .when(on, (ch) =>
                                  ch.child(
                                    div()
                                      .px(5)
                                      .py(0.5)
                                      .rounded(4)
                                      .text_size(10)
                                      .bg("#89b4fa22")
                                      .text_color("#89b4fa")
                                      .child("current"),
                                  ),
                                ),
                            )
                            .child(
                              div()
                                .text_size(10.5)
                                .text_color("#6c7086")
                                .child(s.folder ? s.folder.replace(/\/+$/, "").split("/").pop() : "~"),
                            ),
                        ),
                    )
                    .child(
                      h_flex()
                        .gap(10)
                        .items_center()
                        .when(crew.length > 0, (ch) =>
                          ch.child(
                            h_flex()
                              .gap(5)
                              .items_center()
                              .child(div().size(6).rounded_full().bg(dotColor))
                              .child(
                                div()
                                  .text_size(11)
                                  .text_color("#a6adc8")
                                  .child(`${crew.length} staff`),
                              ),
                          ),
                        )
                        .child(
                          h_flex()
                            .h(20)
                            .px(6)
                            .rounded(4)
                            .bg("#11111b")
                            .border_1()
                            .border_color("#ffffff10")
                            .items_center()
                            .child(
                              div()
                                .text_size(10.5)
                                .font_mono()
                                .text_color("#a6adc8")
                                .child(`Alt+${i + 1}`),
                            ),
                        ),
                    );
                }),
              ),
          )
          .child(
            h_flex()
              .justify_between()
              .text_size(11)
              .text_color("#6c7086")
              .child("↑/↓ navigate · Enter switch · 1–9 quick jump · Esc close")
              .child("Switch between workspace floors instantly"),
          ),
      )
      .when(this.tab === "hotkeys", (el) =>
        el
          .child(
            v_flex()
              .flex_1()
              .min_h(0)
              .gap(12)
              .overflow_y_scrollbar()
              .child(
                div()
                  .text_size(12.5)
                  .text_color("#a6adc8")
                  .child(
                    "Choose a navigation preset below to automatically update your ~/.config/herdr-app/keys.json file in real-time.",
                  ),
              )
              .when(Boolean(this.notice), (ch) =>
                ch.child(
                  h_flex()
                    .p(8)
                    .rounded(7)
                    .bg("#89b4fa18")
                    .border_1()
                    .border_color("#89b4fa44")
                    .text_color("#89b4fa")
                    .text_size(12)
                    .child(this.notice),
                ),
              )
              .child(
                v_flex()
                  .gap(8)
                  .children(
                    Object.entries(PRESETS).map(([key, p]) =>
                      h_flex()
                        .p(12)
                        .rounded(10)
                        .bg("#1e1e2e")
                        .border_1()
                        .border_color("#ffffff14")
                        .items_center()
                        .justify_between()
                        .child(
                          v_flex()
                            .gap(3)
                            .child(div().font_semibold().text_color("#cdd6f4").child(p.name))
                            .child(div().text_size(11.5).text_color("#a6adc8").child(p.desc))
                            .child(
                              h_flex()
                                .gap(6)
                                .pt(4)
                                .children(
                                  Object.entries(p.keys).map(([k, act]) =>
                                    h_flex()
                                      .h(20)
                                      .px(6)
                                      .rounded(4)
                                      .bg("#11111b")
                                      .items_center()
                                      .gap(4)
                                      .child(div().text_size(10.5).font_bold().text_color("#89b4fa").child(k))
                                      .child(div().text_size(10).text_color("#6c7086").child("→"))
                                      .child(div().text_size(10).text_color("#a6adc8").child(act)),
                                  ),
                                ),
                            ),
                        )
                        .child(
                          h_flex()
                            .h(30)
                            .px(12)
                            .rounded(7)
                            .cursor_pointer()
                            .bg("#89b4fa")
                            .items_center()
                            .hover((s) => s.opacity(0.88))
                            .on_click(() => this.applyPreset(key, cx))
                            .child(
                              div()
                                .font_semibold()
                                .text_size(12)
                                .text_color("#181825")
                                .child("Apply Preset"),
                            ),
                        ),
                    ),
                  ),
              )
              .child(
                h_flex()
                  .pt(4)
                  .justify_between()
                  .text_size(11)
                  .text_color("#6c7086")
                  .child("Custom bindings are applied to both global & terminal sections.")
                  .child("Hot reload active"),
              ),
          ),
      );
  }
}
