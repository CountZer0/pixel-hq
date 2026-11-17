// Pixel HQ Hotkeys Manager
// Custom hotkey management, live active bindings inspection, and curated presets.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, theme, props, closeOverlay, readTextFile, writeTextFile, keys } from "herdr";

const MONO = "JetBrains Mono, Menlo, monospace";

const PRESETS = {
  vscode: {
    name: "VS Code Fast Nav (Recommended)",
    desc: "Ctrl+P for Switcher, Alt+[ and Alt+] for prev/next space",
    keys: {
      "ctrl-p": "mod.open:company-switcher",
      "alt-[": "space.prev",
      "alt-]": "space.next",
    },
  },
  tmux: {
    name: "Tmux Style",
    desc: "Ctrl+B for Switcher, Alt+N and Alt+P for next/prev space (safe: preserves Alt+J/K for panes)",
    keys: {
      "ctrl-b": "mod.open:company-switcher",
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
  { id: "mod.open:company-switcher", label: "Floor Switcher", desc: "Open the floor switcher modal" },
  { id: "space.next", label: "Next Space", desc: "Jump to next workspace floor" },
  { id: "space.prev", label: "Prev Space", desc: "Jump to previous workspace floor" },
  { id: "space.new", label: "New Space", desc: "Create new workspace floor" },
  { id: "app.palette", label: "Command Palette", desc: "Open Herdr command palette" },
];

export default class CompanyHotkeys extends View {
  init(_props, cx) {
    this.notice = null;
    this.loading = false;
    this.targetAction = "mod.open:company-switcher";

    this.customKeyInput = InputState.new({ placeholder: "e.g. ctrl-p, alt-w, ctrl-b, alt-[" });

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.customKeyInput.focus();
    cx.timer.after(200, () => this.customKeyInput.focus());
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
    this.notice = `Saving hotkey ${chord}…`;
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
      this.notice = `Error saving hotkey: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      cx.notify();
    }
  }

  async removeKey(chord, cx) {
    this.loading = true;
    this.notice = `Removing hotkey ${chord}…`;
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
      this.notice = `✓ Removed hotkey: ${chord}.`;
    } catch (err) {
      this.notice = `Error removing hotkey: ${err?.message ?? err}`;
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
      this.notice = `Error saving hotkeys: ${err?.message ?? err}`;
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
    const currentBindings = this.getCurrentNavBindings();

    return v_flex()
      .id("company-hotkeys")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          closeOverlay(props()?.overlay);
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
                  .child(div().text_size(12).font_bold().text_color("#89b4fa").child("⌨")),
              )
              .child(
                div()
                  .text_size(14)
                  .font_semibold()
                  .text_color("#cdd6f4")
                  .child("Pixel HQ Hotkeys"),
              ),
          )
          .child(
            div()
              .id("btn-esc")
              .px(8)
              .py(3)
              .rounded(5)
              .text_size(11)
              .text_color("#6c7086")
              .cursor_pointer()
              .hover((s) => s.bg("#ffffff14").text_color("#cdd6f4"))
              .on_click(() => closeOverlay(props()?.overlay))
              .child("Esc"),
          ),
      )
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
          // Section 1: Custom Hotkey Input
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
                  .child("Custom Hotkey (Tự đặt phím tắt theo ý muốn)"),
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
                          .child("Save Hotkey"),
                      ),
                  ),
              ),
          )
          // Section 2: Active Hotkeys
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
                  .child("Active Hotkeys (Phím tắt đang hoạt động)"),
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
                  .child("Curated Presets (Bộ phím tắt cấu hình sẵn)"),
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
          ),
      )
      .child(
        h_flex()
          .justify_between()
          .text_size(11)
          .text_color("#6c7086")
          .child("Changes saved directly to ~/.config/herdr-app/keys.json")
          .child("Esc close"),
      );
  }
}
