// Pixel HQ Keymap & Workspace Switcher
// Instant switching between spaces/floors, VS Code style Ctrl+P cycling, and custom hotkey management.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, run, theme, props, closeOverlay, readTextFile, writeTextFile, keys } from "herdr";

const MONO = "JetBrains Mono, Menlo, monospace";

const PRESETS = {
  vscode: {
    name: "VS Code Fast Nav (Recommended)",
    desc: "Ctrl+P for quick Switcher & cycle, Alt+[ and Alt+] for prev/next space",
    keys: {
      "ctrl-p": "mod.open:company-keymap",
      "alt-[": "space.prev",
      "alt-]": "space.next",
    },
  },
  tmux: {
    name: "Tmux Style",
    desc: "Ctrl+B for Switcher, Alt+N and Alt+P for next/prev space (safe: preserves Alt+J/K for panes)",
    keys: {
      "ctrl-b": "mod.open:company-keymap",
      "alt-n": "space.next",
      "alt-p": "space.prev",
    },
  },
  defaults: {
    name: "Herdr Defaults (Reset)",
    desc: "Reset to default Herdr bindings: Ctrl+Shift+P for palette, Ctrl+Shift+PageDown/Up for spaces",
    keys: {
      "ctrl-p": "app.palette",
      "ctrl-shift-p": "app.palette",
      "ctrl-shift-pagedown": "space.next",
      "ctrl-shift-pageup": "space.prev",
    },
  },
};

const ACTION_OPTIONS = [
  { id: "mod.open:company-keymap", label: "Floor Switcher", desc: "Open this floor switcher modal" },
  { id: "space.next", label: "Next Space", desc: "Jump to next workspace floor" },
  { id: "space.prev", label: "Prev Space", desc: "Jump to previous workspace floor" },
  { id: "space.new", label: "New Space", desc: "Create new workspace floor" },
  { id: "app.palette", label: "Command Palette", desc: "Open Herdr command palette" },
];

export default class CompanyKeymap extends View {
  init(_props, cx) {
    this.tab = "switcher";
    this.filter = "";
    this.selected = 0;
    this.notice = null;
    this.loading = false;
    this.cycling = false;
    this.targetAction = "mod.open:company-keymap";

    this.input = InputState.new({ placeholder: "Search workspace / floor, or press 1-9 to jump…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value().toLowerCase().trim();
      this.selected = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.switchCurrent(cx));

    this.customKeyInput = InputState.new({ placeholder: "e.g. ctrl-p, alt-w, ctrl-b" });

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

  normalizeKey(input) {
    if (!input) return "";
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/\+/g, "-");
  }

  async saveCustomKey(cx) {
    const rawKey = this.customKeyInput.value();
    const chord = this.normalizeKey(rawKey);
    if (!chord) {
      this.notice = "Please enter a valid key chord (e.g. ctrl-p, alt-w, ctrl-b).";
      cx.notify();
      return;
    }

    this.loading = true;
    this.notice = `Saving shortcut ${chord}…`;
    cx.notify();

    try {
      const raw = await readTextFile("keys.json").catch(() => null);
      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = {}; }
      }
      data.global = data.global ?? {};
      data.terminal = data.terminal ?? {};

      data.global[chord] = this.targetAction;
      data.terminal[chord] = this.targetAction;

      const nextRaw = JSON.stringify(data, null, 2) + "\n";
      await writeTextFile("keys.json", nextRaw, raw);
      this.notice = `✓ Saved: ${chord} → ${this.targetAction}! Applied live to keys.json.`;
    } catch (err) {
      this.notice = `Error saving key: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      cx.notify();
    }
  }

  async removeKey(chord, cx) {
    this.loading = true;
    this.notice = `Removing shortcut ${chord}…`;
    cx.notify();

    try {
      const raw = await readTextFile("keys.json").catch(() => null);
      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = {}; }
      }
      if (data.global) delete data.global[chord];
      if (data.terminal) delete data.terminal[chord];

      const nextRaw = JSON.stringify(data, null, 2) + "\n";
      await writeTextFile("keys.json", nextRaw, raw);
      this.notice = `✓ Removed shortcut: ${chord}.`;
    } catch (err) {
      this.notice = `Error removing key: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      cx.notify();
    }
  }

  async applyPreset(presetKey, cx) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    this.loading = true;
    this.notice = `Applying ${preset.name}…`;
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
        if (action === null) {
          delete data.global[key];
          delete data.terminal[key];
        } else {
          data.global[key] = action;
          data.terminal[key] = action;
        }
      }

      const nextRaw = JSON.stringify(data, null, 2) + "\n";
      await writeTextFile("keys.json", nextRaw, raw);
      this.notice = `✓ Applied: ${preset.name}! Updated live in keys.json.`;
    } catch (err) {
      this.notice = `Error saving keys: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      cx.notify();
    }
  }

  getCurrentNavBindings() {
    const allKeys = keys() ?? [];
    const navActions = new Set(ACTION_OPTIONS.map((a) => a.id));
    const map = new Map();
    for (const k of allKeys) {
      if (k.section === "global" && navActions.has(k.action)) {
        if (!map.has(k.action)) map.set(k.action, []);
        map.get(k.action).push(k.keys);
      }
    }
    return map;
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
    const currentBindings = this.getCurrentNavBindings();

    const tabBtn = (id, label) => {
      const on = this.tab === id;
      return h_flex()
        .id(`tab-${id}`)
        .h(28)
        .px(12)
        .gap(6)
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .bg(on ? "#313244" : "#00000000")
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
      .on_modifiers_changed((e, cx) => {
        const ctrlDown = Boolean(e.modifiers?.control || e.modifiers?.platform);
        if (!ctrlDown && this.cycling) {
          this.cycling = false;
          this.switchCurrent(cx);
        }
      })
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          this.cycling = false;
          closeOverlay(props()?.overlay);
          cx.stop_propagation();
          return;
        }

        const isCtrlOrCmd = Boolean(e.modifiers?.control || e.modifiers?.platform);
        const isP = e.key === "p" || e.key === "P" || e.keystroke?.endsWith("-p");

        if (isCtrlOrCmd && isP) {
          if (this.tab !== "switcher") {
            this.tab = "switcher";
          }
          const list = this.filteredSpaces();
          if (list.length > 0) {
            if (e.modifiers?.shift) {
              this.selected = (this.selected - 1 + list.length) % list.length;
            } else {
              this.selected = (this.selected + 1) % list.length;
            }
            this.cycling = true;
            cx.stop_propagation();
            cx.notify();
            return;
          }
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
            this.cycling = false;
            this.switchCurrent(cx);
            cx.stop_propagation();
            return;
          }
          if (!this.filter && /^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key, 10) - 1;
            const all = spaces() ?? [];
            if (all[idx]) {
              this.cycling = false;
              run("space.select", { id: all[idx].id });
              closeOverlay(props()?.overlay);
              cx.stop_propagation();
              return;
            }
          }
        }
      })
      .on_key_up((e, cx) => {
        const k = (e.key ?? "").toLowerCase();
        if ((k === "control" || k === "ctrl" || k === "meta" || k === "command") && this.cycling) {
          this.cycling = false;
          this.switchCurrent(cx);
          cx.stop_propagation();
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
              .child(tabBtn("switcher", "Switch Floors"))
              .child(tabBtn("hotkeys", "Hotkeys & Keymap"))
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
                    .bg(isSel ? "#313244" : on ? "#ffffff0c" : "#00000000")
                    .border_1()
                    .border_color(isSel ? "#89b4fa66" : on ? "#89b4fa33" : "#00000000")
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
                                .font_family(MONO)
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
              .child("Hold Ctrl + press P to cycle & release to switch · 1–9 quick jump")
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
              // Section 1: Custom Keymap Input
              .child(
                v_flex()
                  .p(12)
                  .gap(8)
                  .rounded(10)
                  .bg("#1e1e2e")
                  .border_1()
                  .border_color("#ffffff14")
                  .child(
                    div()
                      .font_semibold()
                      .text_size(13)
                      .text_color("#cdd6f4")
                      .child("Custom Shortcut (Tự đặt phím tắt theo ý muốn)"),
                  )
                  .child(
                    div()
                      .text_size(11)
                      .text_color("#a6adc8")
                      .child("Choose an action and type your desired key chord (e.g. ctrl-p, alt-w, ctrl-b, alt-[):"),
                  )
                  .child(
                    h_flex()
                      .gap(6)
                      .flex_wrap()
                      .children(
                        ACTION_OPTIONS.map((opt) => {
                          const active = this.targetAction === opt.id;
                          return h_flex()
                            .px(8)
                            .py(3)
                            .rounded(5)
                            .cursor_pointer()
                            .bg(active ? "#89b4fa" : "#11111b")
                            .text_color(active ? "#181825" : "#cdd6f4")
                            .font_medium()
                            .text_size(11)
                            .border_1()
                            .border_color(active ? "#89b4fa" : "#ffffff10")
                            .hover((s) => s.opacity(0.85))
                            .on_click(() => {
                              this.targetAction = opt.id;
                              cx.notify();
                            })
                            .child(opt.label);
                        }),
                      ),
                  )
                  .child(
                    h_flex()
                      .gap(8)
                      .items_center()
                      .child(
                        Input.new(this.customKeyInput)
                          .h(32)
                          .flex_1()
                          .px(10)
                          .rounded(6)
                          .border_1()
                          .border_color("#89b4fa66")
                          .bg("#181825")
                          .text_size(12)
                          .text_color("#cdd6f4"),
                      )
                      .child(
                        h_flex()
                          .h(32)
                          .px(14)
                          .rounded(6)
                          .cursor_pointer()
                          .bg("#89b4fa")
                          .items_center()
                          .hover((s) => s.opacity(0.88))
                          .on_click(() => this.saveCustomKey(cx))
                          .child(
                            div()
                              .font_semibold()
                              .text_size(12)
                              .text_color("#181825")
                              .child("Save Shortcut"),
                          ),
                      ),
                  ),
              )
              // Section 2: Active Navigation Bindings
              .child(
                v_flex()
                  .p(12)
                  .gap(8)
                  .rounded(10)
                  .bg("#1e1e2e")
                  .border_1()
                  .border_color("#ffffff14")
                  .child(
                    div()
                      .font_semibold()
                      .text_size(13)
                      .text_color("#cdd6f4")
                      .child("Active Navigation Shortcuts (Phím tắt đang hoạt động)"),
                  )
                  .child(
                    v_flex()
                      .gap(6)
                      .children(
                        ACTION_OPTIONS.map((opt) => {
                          const keysList = currentBindings.get(opt.id) ?? [];
                          return h_flex()
                            .p(6)
                            .rounded(6)
                            .bg("#181825")
                            .items_center()
                            .justify_between()
                            .child(
                              v_flex()
                                .gap(1)
                                .child(div().text_size(12).font_medium().text_color("#cdd6f4").child(opt.label))
                                .child(div().text_size(10.5).text_color("#6c7086").child(opt.desc)),
                            )
                            .child(
                              h_flex()
                                .gap(6)
                                .items_center()
                                .children(
                                  keysList.length > 0
                                    ? keysList.map((k) =>
                                        h_flex()
                                          .h(22)
                                          .px(6)
                                          .gap(4)
                                          .rounded(4)
                                          .bg("#11111b")
                                          .border_1()
                                          .border_color("#89b4fa44")
                                          .items_center()
                                          .child(
                                            div()
                                              .text_size(10.5)
                                              .font_bold()
                                              .font_family(MONO)
                                              .text_color("#89b4fa")
                                              .child(k),
                                          )
                                          .child(
                                            div()
                                              .cursor_pointer()
                                              .text_size(10)
                                              .text_color("#f38ba8")
                                              .hover((s) => s.text_color("#ff0000"))
                                              .on_click(() => this.removeKey(k, cx))
                                              .child("×"),
                                          ),
                                      )
                                    : [
                                        div()
                                          .text_size(11)
                                          .text_color("#6c7086")
                                          .child("Not bound"),
                                      ],
                                ),
                            );
                        }),
                      ),
                  ),
              )
              // Section 3: Curated Presets
              .child(
                v_flex()
                  .p(12)
                  .gap(8)
                  .rounded(10)
                  .bg("#1e1e2e")
                  .border_1()
                  .border_color("#ffffff14")
                  .child(
                    div()
                      .font_semibold()
                      .text_size(13)
                      .text_color("#cdd6f4")
                      .child("Quick Navigation Presets (Bộ phím tắt cấu hình sẵn)"),
                  )
                  .child(
                    v_flex()
                      .gap(8)
                      .children(
                        Object.entries(PRESETS).map(([key, p]) =>
                          h_flex()
                            .p(10)
                            .rounded(8)
                            .bg("#181825")
                            .border_1()
                            .border_color("#ffffff10")
                            .items_center()
                            .justify_between()
                            .child(
                              v_flex()
                                .gap(2)
                                .child(div().font_semibold().text_color("#cdd6f4").child(p.name))
                                .child(div().text_size(11).text_color("#a6adc8").child(p.desc))
                                .child(
                                  h_flex()
                                    .gap(6)
                                    .pt(4)
                                    .children(
                                      Object.entries(p.keys)
                                        .filter(([, act]) => act !== null)
                                        .map(([k, act]) =>
                                          h_flex()
                                            .h(18)
                                            .px(5)
                                            .rounded(4)
                                            .bg("#11111b")
                                            .items_center()
                                            .gap(4)
                                            .child(
                                              div()
                                                .text_size(10)
                                                .font_bold()
                                                .font_family(MONO)
                                                .text_color("#89b4fa")
                                                .child(k),
                                            )
                                            .child(div().text_size(9).text_color("#6c7086").child("→"))
                                            .child(div().text_size(9.5).text_color("#a6adc8").child(act)),
                                        ),
                                    ),
                                ),
                            )
                            .child(
                              h_flex()
                                .h(28)
                                .px(10)
                                .rounded(6)
                                .cursor_pointer()
                                .bg("#89b4fa")
                                .items_center()
                                .hover((s) => s.opacity(0.88))
                                .on_click(() => this.applyPreset(key, cx))
                                .child(
                                  div()
                                    .font_semibold()
                                    .text_size(11.5)
                                    .text_color("#181825")
                                    .child("Apply"),
                                ),
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
