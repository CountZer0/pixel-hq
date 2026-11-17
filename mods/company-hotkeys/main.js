// Pixel HQ Hotkeys Manager
// Custom hotkey management, live active bindings inspection, and curated presets.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, theme, props, closeOverlay, readTextFile, writeTextFile, keys, appHome } from "herdr";

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
    switcherKeys: {
      "ctrl-p": "company-switcher.cycle",
      "ctrl-shift-p": "company-switcher.cycleBack",
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
    switcherKeys: {
      "ctrl-b": "company-switcher.cycle",
    },
  },
  defaults: {
    name: "Herdr Defaults (Reset)",
    desc: "Reset to Herdr defaults: Ctrl+Shift+P for palette, Ctrl+Shift+PageDown/Up for spaces",
    keys: {
      "ctrl-p": "app.palette",
      "ctrl-shift-p": "app.palette",
      "ctrl-shift-pagedown": "space.next",
      "ctrl-shift-pageup": "space.prev",
    },
    switcherKeys: null,
  },
};

const ACTION_OPTIONS = [
  {
    id: "mod.open:company-switcher",
    key: "switcher",
    label: "Floor Switcher",
    desc: "Open the floor switcher modal",
    preKeys: [
      { chord: "ctrl-p", label: "Ctrl+P (Recommended - VS Code Quick Open)" },
      { chord: "ctrl-b", label: "Ctrl+B (Tmux prefix style)" },
      { chord: "alt-w", label: "Alt+W (Fast floor switch)" },
      { chord: "ctrl-k", label: "Ctrl+K (Palette / Quick Open)" },
      { chord: "alt-p", label: "Alt+P (Alt palette)" },
    ],
  },
  {
    id: "space.next",
    key: "next",
    label: "Next Space",
    desc: "Jump to next workspace floor",
    preKeys: [
      { chord: "alt-]", label: "Alt+] (Standard next space)" },
      { chord: "alt-n", label: "Alt+N (Tmux next space)" },
      { chord: "ctrl-pagedown", label: "Ctrl+PageDown" },
      { chord: "ctrl-shift-pagedown", label: "Ctrl+Shift+PageDown (Herdr default)" },
      { chord: "alt-right", label: "Alt+Right" },
    ],
  },
  {
    id: "space.prev",
    key: "prev",
    label: "Prev Space",
    desc: "Jump to previous workspace floor",
    preKeys: [
      { chord: "alt-[", label: "Alt+[ (Standard prev space)" },
      { chord: "alt-p", label: "Alt+P (Tmux prev space)" },
      { chord: "ctrl-pageup", label: "Ctrl+PageUp" },
      { chord: "ctrl-shift-pageup", label: "Ctrl+Shift+PageUp (Herdr default)" },
      { chord: "alt-left", label: "Alt+Left" },
    ],
  },
  {
    id: "space.new",
    key: "new",
    label: "New Space",
    desc: "Create new workspace floor",
    preKeys: [
      { chord: "ctrl-shift-n", label: "Ctrl+Shift+N (Herdr default)" },
      { chord: "ctrl-t", label: "Ctrl+T (Browser new tab style)" },
      { chord: "alt-t", label: "Alt+T" },
      { chord: "alt-c", label: "Alt+C (Tmux create style)" },
    ],
  },
  {
    id: "app.palette",
    key: "palette",
    label: "Command Palette",
    desc: "Open Herdr command palette",
    preKeys: [
      { chord: "ctrl-shift-p", label: "Ctrl+Shift+P (Standard VS Code / Herdr)" },
      { chord: "f1", label: "F1 (Classic VS Code command palette)" },
      { chord: "ctrl-p", label: "Ctrl+P (Herdr default palette)" },
    ],
  },
];

function sanitizeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function keysPath() {
  try {
    const home = appHome();
    if (home) return `${home}/keys.json`;
  } catch {}
  return "keys.json";
}

export default class CompanyHotkeys extends View {
  init(_props, cx) {
    this.notice = null;
    this.targetAction = "mod.open:company-switcher";
    this.selectedChord = "ctrl-p";
    this.dropdownOpen = false;

    // Visual button states
    this.saving = false;
    this.justSavedChord = null;
    this.deletingChord = null;
    this.applyingPreset = null;
    this.justAppliedPreset = null;

    // Cache of parsed keys.json for zero-delay UI reactivity
    this.cachedData = null;

    this.handle = cx.focus_handle();
    this.handle.focus();

    cx.spawn(async (cx) => {
      try {
        const raw = await readTextFile(keysPath()).catch(() => null);
        if (raw) {
          this.cachedData = JSON.parse(raw);
          cx.notify();
        }
      } catch {}
    });
  }

  closeModal() {
    const ov = props()?.overlay;
    if (ov) {
      closeOverlay(ov);
    } else {
      run("overlay.close");
    }
  }

  getCurrentNavBindings() {
    const map = new Map();
    const navActions = new Set(ACTION_OPTIONS.map((a) => a.id));

    if (this.cachedData?.global) {
      for (const [chord, act] of Object.entries(this.cachedData.global)) {
        if (navActions.has(act)) {
          if (!map.has(act)) map.set(act, []);
          map.get(act).push(chord);
        }
      }
      return map;
    }

    const allKeys = keys() ?? [];
    for (const k of allKeys) {
      if (k.section === "global" && navActions.has(k.action)) {
        if (!map.has(k.action)) map.set(k.action, []);
        map.get(k.action).push(k.keys);
      }
    }
    return map;
  }

  isPresetActive(presetKey, currentBindings) {
    const preset = PRESETS[presetKey];
    if (!preset) return false;
    for (const [chord, act] of Object.entries(preset.keys)) {
      if (act === null) continue;
      const bound = currentBindings.get(act) ?? [];
      if (!bound.includes(chord)) return false;
    }
    return true;
  }

  saveSelectedKey(cx) {
    const chord = this.selectedChord;
    if (!chord) return;

    this.saving = true;
    this.notice = `Assigning ${chord}…`;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const p = keysPath();
        const raw = await readTextFile(p).catch(() => null);
        let data = {};
        if (raw) {
          try { data = JSON.parse(raw); } catch { data = {}; }
        }
        data.global = data.global ?? {};
        data.terminal = data.terminal ?? {};

        data.global[chord] = this.targetAction;
        data.terminal[chord] = this.targetAction;

        if (this.targetAction === "mod.open:company-switcher") {
          data["mod:company-switcher"] = data["mod:company-switcher"] ?? {};
          data["mod:company-switcher"][chord] = "company-switcher.cycle";
        }

        const nextRaw = JSON.stringify(data, null, 2) + "\n";
        await writeTextFile(p, nextRaw, raw);

        this.cachedData = data;
        this.justSavedChord = chord;
        this.notice = `✓ Assigned: ${chord} → ${this.targetAction}! Updated live in keys.json.`;
        cx.notify();

        cx.timer.after(2500, () => {
          this.justSavedChord = null;
          cx.notify();
        });
      } catch (err) {
        this.notice = `Error saving hotkey: ${err?.message ?? err}`;
      } finally {
        this.saving = false;
        cx.notify();
      }
    });
  }

  removeKey(chord, cx) {
    this.deletingChord = chord;
    this.notice = `Removing hotkey ${chord}…`;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const p = keysPath();
        const raw = await readTextFile(p).catch(() => null);
        let data = {};
        if (raw) {
          try { data = JSON.parse(raw); } catch { data = {}; }
        }
        if (data.global) delete data.global[chord];
        if (data.terminal) delete data.terminal[chord];
        if (data["mod:company-switcher"]) delete data["mod:company-switcher"][chord];

        const nextRaw = JSON.stringify(data, null, 2) + "\n";
        await writeTextFile(p, nextRaw, raw);

        this.cachedData = data;
        this.notice = `✓ Removed hotkey: ${chord}.`;
      } catch (err) {
        this.notice = `Error removing hotkey: ${err?.message ?? err}`;
      } finally {
        this.deletingChord = null;
        cx.notify();
      }
    });
  }

  applyPreset(presetKey, cx) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    this.applyingPreset = presetKey;
    this.notice = `Applying ${preset.name}…`;
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const p = keysPath();
        const raw = await readTextFile(p).catch(() => null);
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

        if (preset.switcherKeys) {
          data["mod:company-switcher"] = { ...preset.switcherKeys };
        } else {
          delete data["mod:company-switcher"];
          delete data.global["alt-["];
          delete data.global["alt-]"];
          delete data.terminal["alt-["];
          delete data.terminal["alt-]"];
        }

        const nextRaw = JSON.stringify(data, null, 2) + "\n";
        await writeTextFile(p, nextRaw, raw);

        this.cachedData = data;
        this.justAppliedPreset = presetKey;
        this.notice = `✓ Applied: ${preset.name}! Updated live in keys.json.`;
        cx.notify();

        cx.timer.after(2500, () => {
          this.justAppliedPreset = null;
          cx.notify();
        });
      } catch (err) {
        this.notice = `Error saving hotkeys: ${err?.message ?? err}`;
      } finally {
        this.applyingPreset = null;
        cx.notify();
      }
    });
  }

  render(cx) {
    const currentBindings = this.getCurrentNavBindings();
    const curAction = ACTION_OPTIONS.find((a) => a.id === this.targetAction) ?? ACTION_OPTIONS[0];

    // Ensure selected chord is valid for current action
    const currentPreKey = curAction.preKeys.find((pk) => pk.chord === this.selectedChord) ?? curAction.preKeys[0];
    const isBound = (currentBindings.get(this.targetAction) ?? []).includes(this.selectedChord);

    return v_flex()
      .id("company-hotkeys")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          if (this.dropdownOpen) {
            this.dropdownOpen = false;
            cx.stop_propagation();
            cx.notify();
            return;
          }
          this.closeModal();
          cx.stop_propagation();
        }
      })
      .size_full()
      .min_h(0)
      .p(14)
      .gap(10)
      .bg("#181825")
      .rounded(12)
      .border_1()
      .border_color("#ffffff14")
      .text_size(12.5)
      .child(
        h_flex()
          .h(28)
          .items_center()
          .justify_between()
          .child(
            h_flex()
              .gap(8)
              .items_center()
              .child(
                h_flex()
                  .size(22)
                  .rounded(5)
                  .bg("#89b4fa22")
                  .items_center()
                  .justify_center()
                  .child(div().text_size(11).font_bold().text_color("#89b4fa").child("⌨")),
              )
              .child(
                div()
                  .text_size(13.5)
                  .font_semibold()
                  .text_color("#cdd6f4")
                  .child("Pixel HQ Hotkeys"),
              ),
          )
          .child(
            h_flex()
              .id("btn-esc-hotkeys")
              .px(8)
              .py(2)
              .rounded(5)
              .text_size(11)
              .text_color("#6c7086")
              .cursor_pointer()
              .hover((s) => s.bg("#ffffff14").text_color("#cdd6f4"))
              .on_click((_e, _cx) => this.closeModal())
              .child("Esc"),
          ),
      )
      .child(
        v_flex()
          .id("hotkeys-scroll-area")
          .flex_1()
          .min_h(0)
          .gap(10)
          .overflow_y_scrollbar()
          .when(Boolean(this.notice), (ch) =>
            ch.child(
              h_flex()
                .p(6)
                .rounded(6)
                .bg("#89b4fa18")
                .border_1()
                .border_color("#89b4fa44")
                .text_color("#89b4fa")
                .text_size(11.5)
                .child(this.notice),
            ),
          )
          // Section 1: Pre-defined Key Dropdown Selector
          .child(
            v_flex()
              .p(10)
              .gap(6)
              .rounded(8)
              .bg("#1e1e2e")
              .border_1()
              .border_color("#ffffff14")
              .child(
                div()
                  .font_semibold()
                  .text_size(12)
                  .text_color("#cdd6f4")
                  .child("Assign Hotkey (Chọn phím tắt sẵn có)"),
              )
              .child(
                div()
                  .text_size(10.5)
                  .text_color("#a6adc8")
                  .child("1. Chọn chức năng muốn gán phím tắt:"),
              )
              .child(
                h_flex()
                  .gap(5)
                  .flex_wrap()
                  .children(
                    ACTION_OPTIONS.map((opt) => {
                      const active = this.targetAction === opt.id;
                      return h_flex()
                        .id(`chip-${opt.key}`)
                        .px(8)
                        .py(3.5)
                        .rounded(4)
                        .cursor_pointer()
                        .bg(active ? "#89b4fa" : "#11111b")
                        .text_color(active ? "#181825" : "#cdd6f4")
                        .font_medium()
                        .text_size(11)
                        .border_1()
                        .border_color(active ? "#89b4fa" : "#ffffff10")
                        .hover((s) => s.opacity(0.85))
                        .on_click((_e, cx) => {
                          this.targetAction = opt.id;
                          this.selectedChord = opt.preKeys[0].chord;
                          this.dropdownOpen = false;
                          cx.notify();
                        })
                        .child(opt.label);
                    }),
                  ),
              )
              .child(
                div()
                  .pt(2)
                  .text_size(10.5)
                  .text_color("#a6adc8")
                  .child("2. Chọn phím tắt định sẵn và gán:"),
              )
              .child(
                h_flex()
                  .gap(6)
                  .items_center()
                  .child(
                    h_flex()
                      .id("dropdown-trigger")
                      .flex_1()
                      .h(32)
                      .px(10)
                      .rounded(5)
                      .border_1()
                      .border_color(this.dropdownOpen ? "#89b4fa" : "#ffffff18")
                      .bg("#11111b")
                      .items_center()
                      .justify_between()
                      .cursor_pointer()
                      .hover((s) => s.border_color("#89b4fa88"))
                      .on_click((_e, cx) => {
                        this.dropdownOpen = !this.dropdownOpen;
                        cx.notify();
                      })
                      .child(
                        h_flex()
                          .gap(8)
                          .items_center()
                          .child(
                            h_flex()
                              .h(20)
                              .px(6)
                              .rounded(4)
                              .bg("#181825")
                              .border_1()
                              .border_color("#89b4fa44")
                              .items_center()
                              .child(
                                div()
                                  .text_size(10)
                                  .font_bold()
                                  .font_family(MONO)
                                  .text_color("#89b4fa")
                                  .child(currentPreKey.chord),
                              ),
                          )
                          .child(
                            div()
                              .text_size(11)
                              .text_color("#cdd6f4")
                              .child(currentPreKey.label),
                          ),
                      )
                      .child(
                        div()
                          .text_size(9)
                          .text_color("#89b4fa")
                          .child(this.dropdownOpen ? "▲" : "▼"),
                      ),
                  )
                  .child(
                    h_flex()
                      .id("btn-assign-hotkey")
                      .h(32)
                      .px(14)
                      .rounded(5)
                      .cursor_pointer()
                      .when(this.justSavedChord === this.selectedChord, (el) =>
                        el.bg("#a6e3a1").text_color("#181825"),
                      )
                      .when(this.justSavedChord !== this.selectedChord && !isBound, (el) =>
                        el.bg("#89b4fa").text_color("#181825").hover((s) => s.opacity(0.88)),
                      )
                      .when(this.justSavedChord !== this.selectedChord && isBound, (el) =>
                        el.bg("#313244").text_color("#a6adc8"),
                      )
                      .items_center()
                      .justify_center()
                      .font_semibold()
                      .text_size(11.5)
                      .on_click((_e, cx) => this.saveSelectedKey(cx))
                      .child(
                        this.saving
                          ? "Saving…"
                          : this.justSavedChord === this.selectedChord
                          ? "✓ Assigned!"
                          : isBound
                          ? "✓ Bound"
                          : "+ Assign",
                      ),
                  ),
              )
              // Dropdown Menu List
              .when(this.dropdownOpen, (el) =>
                el.child(
                  v_flex()
                    .id("dropdown-menu")
                    .p(4)
                    .gap(2)
                    .rounded(6)
                    .bg("#11111b")
                    .border_1()
                    .border_color("#89b4fa55")
                    .children(
                      curAction.preKeys.map((pk) => {
                        const isSelected = this.selectedChord === pk.chord;
                        const cleanK = sanitizeId(pk.chord);
                        return h_flex()
                          .id(`opt-prekey-${cleanK}`)
                          .px(8)
                          .py(5)
                          .rounded(4)
                          .items_center()
                          .justify_between()
                          .cursor_pointer()
                          .when(isSelected, (el) => el.bg("#89b4fa22"))
                          .hover((s) => s.bg("#ffffff12"))
                          .on_click((_e, cx) => {
                            this.selectedChord = pk.chord;
                            this.dropdownOpen = false;
                            cx.notify();
                          })
                          .child(
                            h_flex()
                              .gap(8)
                              .items_center()
                              .child(
                                h_flex()
                                  .h(19)
                                  .px(5)
                                  .rounded(3)
                                  .bg("#181825")
                                  .border_1()
                                  .border_color("#89b4fa33")
                                  .items_center()
                                  .child(
                                    div()
                                      .text_size(9.5)
                                      .font_bold()
                                      .font_family(MONO)
                                      .text_color("#89b4fa")
                                      .child(pk.chord),
                                  ),
                              )
                              .child(
                                div()
                                  .text_size(10.5)
                                  .text_color(isSelected ? "#89b4fa" : "#cdd6f4")
                                  .child(pk.label),
                              ),
                          )
                          .child(
                            div()
                              .text_size(10.5)
                              .text_color("#89b4fa")
                              .child(isSelected ? "✓" : ""),
                          );
                      }),
                    ),
                ),
              ),
          )
          // Section 2: Active Hotkeys
          .child(
            v_flex()
              .p(10)
              .gap(6)
              .rounded(8)
              .bg("#1e1e2e")
              .border_1()
              .border_color("#ffffff14")
              .child(
                div()
                  .font_semibold()
                  .text_size(12)
                  .text_color("#cdd6f4")
                  .child("Active Hotkeys (Phím tắt đang hoạt động)"),
              )
              .child(
                v_flex()
                  .gap(4)
                  .children(
                    ACTION_OPTIONS.map((opt) => {
                      const keysList = currentBindings.get(opt.id) ?? [];
                      return h_flex()
                        .id(`active-row-${opt.key}`)
                        .px(6)
                        .py(4)
                        .rounded(5)
                        .bg("#181825")
                        .items_center()
                        .justify_between()
                        .child(
                          v_flex()
                            .gap(1)
                            .child(div().text_size(11.5).font_medium().text_color("#cdd6f4").child(opt.label))
                            .child(div().text_size(10).text_color("#6c7086").child(opt.desc)),
                        )
                        .child(
                          h_flex()
                            .gap(5)
                            .items_center()
                            .flex_wrap()
                            .children(
                              keysList.length > 0
                                ? keysList.map((k) => {
                                    const cleanK = sanitizeId(k);
                                    const isDeleting = this.deletingChord === k;
                                    return h_flex()
                                      .id(`key-tag-${cleanK}`)
                                      .h(20)
                                      .px(5)
                                      .gap(4)
                                      .rounded(4)
                                      .bg("#11111b")
                                      .border_1()
                                      .border_color("#89b4fa44")
                                      .items_center()
                                      .child(
                                        div()
                                          .text_size(10)
                                          .font_bold()
                                          .font_family(MONO)
                                          .text_color("#89b4fa")
                                          .child(k),
                                      )
                                      .child(
                                        h_flex()
                                          .id(`btn-del-${cleanK}`)
                                          .size(14)
                                          .items_center()
                                          .justify_center()
                                          .rounded(2)
                                          .cursor_pointer()
                                          .text_size(10)
                                          .font_bold()
                                          .text_color(isDeleting ? "#a6adc8" : "#f38ba8")
                                          .hover((s) => s.bg("#f38ba822").text_color("#ff5555"))
                                          .on_click((_e, cx) => this.removeKey(k, cx))
                                          .child(isDeleting ? "…" : "×"),
                                      );
                                  })
                                : [
                                    div()
                                      .text_size(10.5)
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
              .p(10)
              .gap(6)
              .rounded(8)
              .bg("#1e1e2e")
              .border_1()
              .border_color("#ffffff14")
              .child(
                div()
                  .font_semibold()
                  .text_size(12)
                  .text_color("#cdd6f4")
                  .child("Curated Presets (Bộ phím tắt cấu hình sẵn)"),
              )
              .child(
                v_flex()
                  .gap(6)
                  .children(
                    Object.entries(PRESETS).map(([key, p]) => {
                      const isActive = this.isPresetActive(key, currentBindings);
                      const isApplying = this.applyingPreset === key;
                      const isJustApplied = this.justAppliedPreset === key;

                      return h_flex()
                        .id(`preset-card-${key}`)
                        .px(8)
                        .py(6)
                        .rounded(6)
                        .bg("#181825")
                        .border_1()
                        .border_color(isActive ? "#a6e3a155" : "#ffffff10")
                        .items_center()
                        .justify_between()
                        .child(
                          v_flex()
                            .flex_1()
                            .min_w(0)
                            .gap(2)
                            .child(
                              h_flex()
                                .gap(6)
                                .items_center()
                                .child(div().font_semibold().text_size(11.5).text_color("#cdd6f4").child(p.name))
                                .when(isActive, (el) =>
                                  el.child(
                                    h_flex()
                                      .px(5)
                                      .py(1)
                                      .rounded(3)
                                      .bg("#a6e3a122")
                                      .border_1()
                                      .border_color("#a6e3a155")
                                      .text_color("#a6e3a1")
                                      .font_bold()
                                      .text_size(9.5)
                                      .child("ACTIVE"),
                                  ),
                                ),
                            )
                            .child(div().text_size(10.5).text_color("#a6adc8").child(p.desc))
                            .child(
                              h_flex()
                                .id(`preset-badges-${key}`)
                                .gap(5)
                                .flex_wrap()
                                .pt(3)
                                .children(
                                  Object.entries(p.keys)
                                    .filter(([, act]) => act !== null)
                                    .map(([k, act]) =>
                                      h_flex()
                                        .h(18)
                                        .px(5)
                                        .rounded(3)
                                        .bg("#11111b")
                                        .items_center()
                                        .gap(3)
                                        .child(
                                          div()
                                            .text_size(9.5)
                                            .font_bold()
                                            .font_family(MONO)
                                            .text_color("#89b4fa")
                                            .child(k),
                                        )
                                        .child(div().text_size(8.5).text_color("#6c7086").child("→"))
                                        .child(div().text_size(9).text_color("#a6adc8").child(act)),
                                    ),
                                ),
                            ),
                        )
                        .child(
                          h_flex()
                            .id(`btn-apply-${key}`)
                            .flex_none()
                            .ml(12)
                            .h(26)
                            .px(11)
                            .rounded(5)
                            .cursor_pointer()
                            .when(isJustApplied, (el) =>
                              el.bg("#a6e3a1").text_color("#181825"),
                            )
                            .when(!isJustApplied && isActive, (el) =>
                              el
                                .bg("#a6e3a118")
                                .border_1()
                                .border_color("#a6e3a1")
                                .text_color("#a6e3a1"),
                            )
                            .when(!isJustApplied && !isActive, (el) =>
                              el.bg("#89b4fa").text_color("#181825").hover((s) => s.opacity(0.88)),
                            )
                            .items_center()
                            .justify_center()
                            .font_semibold()
                            .text_size(11)
                            .on_click((_e, cx) => this.applyPreset(key, cx))
                            .child(
                              isApplying
                                ? "Applying…"
                                : isJustApplied
                                ? "✓ Applied!"
                                : isActive
                                ? "✓ Active"
                                : "Apply",
                            ),
                        );
                    }),
                  ),
              ),
          ),
      )
      .child(
        h_flex()
          .justify_between()
          .text_size(10.5)
          .text_color("#6c7086")
          .child("Changes saved live to ~/.config/herdr-app/keys.json")
          .child("Esc close"),
      );
  }
}
