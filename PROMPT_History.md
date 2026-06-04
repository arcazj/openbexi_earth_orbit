# Prompt History

## Release Date: 2026-06-03  Version 1.5.6

Fix two blocking defects shown in the attached screenshots: the satellite-selection dropdown can remain stuck open and block controls, and selected-satellite orbit trajectories can render through the front of Earth instead of being occluded by the globe.

These defects must be fixed before adding more pro-version features because they break operator interaction and visual correctness.

Requirements:

0. Inspect the likely target files and functions first.
   - Start with `index.html`, `css/style.css`, `js/SatelliteMenuLoader.js`, and any renderer/scene module that creates or updates the selected satellite orbit path.
   - Locate the exact satellite search/autocomplete DOM elements, event handlers, render function, and CSS classes.
   - Locate the exact `Show Orbit` checkbox handler, selected-orbit creation function, orbit-line material, Earth mesh/material setup, and render pass order.
   - If the implementation is spread across additional loaders or modules, identify them before changing behavior.
   - Document the suspected root cause for each defect before applying the fix.

1. Fix the stuck satellite dropdown.
   - In the screenshot, the red-circled satellite search/autocomplete dropdown remains open after selecting `INTELSAT 902 (IS-902)`.
   - The dropdown overlays the panel below it and prevents the user from clicking controls behind it, including `Show Orbit`, `Show Footprint`, and other satellite actions.
   - When the user selects a satellite from the dropdown, the autocomplete result panel must close immediately.
   - Clicking outside the satellite search field must close the dropdown.
   - Pressing `Escape` must close the dropdown.
   - The closed dropdown must not intercept pointer events.
   - The selected satellite must remain visible in the input or selected-satellite summary after the dropdown closes.
   - The dropdown must reopen only when the user focuses the search field or types a new query.
   - The behavior must work with mouse selection, keyboard selection, touch/click selection, and after clearing the selected satellite.
   - Keyboard selection with `Enter` must select the highlighted result and close the dropdown.

2. Inspect and fix likely dropdown root causes.
   - Review the satellite search input event handlers.
   - Review autocomplete/dropdown open/close state.
   - Review `z-index`, `position`, `pointer-events`, focus, and blur behavior.
   - Check whether a hidden overlay remains mounted and still intercepts clicks.
   - Check whether any handler calls `preventDefault`, traps focus, or reopens the dropdown after selection.
   - Add an explicit dropdown state such as `isSatelliteDropdownOpen` if needed.
   - Use `display: none` or equivalent for the hidden state, not only opacity.
   - Use `pointer-events: none` when the dropdown is hidden.
   - Ensure hidden dropdown parents do not leave an invisible overlay above checkboxes or buttons.
   - Add defensive cleanup when the satellite selector rerenders or filters change.
   - Preserve search filtering, the `Clear` button, selected-satellite summary, YPR controls, orbit controls, footprint controls, and timeline controls.

3. Add accessibility requirements for the satellite dropdown.
   - The search input or combobox wrapper should expose `aria-expanded`.
   - The dropdown should have a stable ID referenced by `aria-controls`.
   - The result list should use an appropriate listbox pattern, such as `role="listbox"` with result rows using `role="option"`, if compatible with the existing markup.
   - The active/highlighted result should be exposed through `aria-activedescendant` or an equivalent accessible pattern.
   - `Escape` must close the dropdown without changing the selected satellite.
   - `Tab` should move focus normally and must not trap the user inside the dropdown.
   - Closing the dropdown must not erase the selected satellite state.

4. Fix selected-satellite orbit rendering through Earth.
   - In the screenshot, when `Show Orbit` is enabled, red orbit trajectory segments that should be behind Earth are visible in front of Earth.
   - Earth must occlude orbit segments that are behind it from the camera point of view.
   - Orbit line segments behind Earth must not render on top of Earth.
   - Orbit line segments in front of Earth must remain visible.
   - The behavior must remain correct while rotating, zooming, and panning the 3D view.
   - The behavior must work for LEO, MEO, GEO, and highly elliptical orbits.
   - The orbit path must not use `depthTest: false` or forced foreground `renderOrder` settings that make it draw over Earth.
   - Earth mesh/material must write to the depth buffer, for example with `depthWrite: true`.
   - If the selected orbit is rendered in a separate overlay/HUD scene or after a depth clear, move it into the main depth-tested 3D scene or explicitly clip/occlude it against Earth.

5. Inspect and fix likely orbit-rendering root causes.
   - Review the `Show Orbit` rendering function and selected-orbit material.
   - Review Three.js material settings for orbit lines: `depthTest`, `depthWrite`, `transparent`, and `renderOrder`.
   - Confirm the Earth material writes to the depth buffer.
   - Confirm orbit lines are rendered in the same scene/depth pass as Earth, or otherwise correctly depth-tested.
   - Confirm the orbit path is parented to the correct scene/frame and transformed consistently with Earth.
   - Check camera near/far planes and depth precision, especially for GEO-scale rendering.
   - Preferred first fix: render orbit lines in the same 3D scene as Earth with `depthTest: true`, no forced foreground `renderOrder`, and Earth depth writing enabled.
   - If depth-buffer rendering is insufficient, split the orbit polyline into visible/invisible segments by testing Earth-sphere occlusion from the current camera viewpoint.
   - Do not solve this by lowering opacity; hidden orbit portions should not be visible through Earth.

6. Review camera and depth precision.
   - GEO orbit scale can create depth precision artifacts if the camera `near` plane is too small or `far` plane is too large.
   - Review camera `near` and `far` values for the orbit scene.
   - If needed, adjust scene scaling, logarithmic depth buffer usage, or near/far ratios without breaking LEO/MEO/GEO visibility.
   - Confirm orbit occlusion remains stable while zooming close to Earth and zooming out to GEO-scale views.

7. Add or update tests where practical.
   - Add DOM-level or unit tests for dropdown open/close behavior if the existing test setup supports it.
   - Test that satellite selection closes the dropdown.
   - Test that keyboard `Enter` selection closes the dropdown.
   - Test that `Escape` closes the dropdown.
   - Test that outside click closes the dropdown.
   - Test that hidden dropdown state does not intercept pointer events.
   - Add a deterministic geometry test for Earth/orbit occlusion if practical.
   - Test or manually verify that selected-orbit material does not use `depthTest: false`.
   - Test or manually verify that Earth depth writing remains enabled.
   - Keep existing tests for filters, satellite search, checkboxes, orbit display, footprints, and menu behavior passing.

8. Update documentation.
   - Update `Test_and_Integration.md` with manual QA steps for the stuck dropdown screenshot scenario.
   - Update `Test_and_Integration.md` with manual QA steps for the selected-orbit-through-Earth screenshot scenario.
   - Include checks for LEO, MEO, and GEO orbit occlusion.
   - Include a regression checklist confirming search, clear, selected summary, orbit, footprint, YPR, timeline, and filter behavior still works.

Manual QA sequence:

1. Load `index.html`.
2. Open the `Satellite Selection` accordion section.
3. Search for `INTELSAT`.
4. Select `INTELSAT 902 (IS-902)`.
5. Confirm the autocomplete dropdown closes immediately.
6. Click `Show Orbit` and confirm it toggles without obstruction.
7. Click `Show Footprint` and confirm it toggles without obstruction.
8. Search again, press `Escape`, and confirm the dropdown closes.
9. Search again, click outside the selector, and confirm the dropdown closes.
10. Enable `Show Orbit`.
11. Rotate the camera until part of the selected orbit should pass behind Earth.
12. Confirm the behind-Earth arc is hidden by Earth and the front-side arc remains visible.
13. Repeat the orbit occlusion check with at least one LEO satellite, one MEO satellite, and one GEO satellite.
14. Confirm the fixes do not break selected satellite summary, YPR controls, timelines, filters, footprints, or view controls.

Acceptance criteria:

- Select `INTELSAT 902 (IS-902)` or any satellite from the dropdown.
- The dropdown disappears immediately after selection.
- Keyboard `Enter` selection closes the dropdown.
- `Show Orbit` can be checked and unchecked without obstruction.
- `Show Footprint` and other controls behind the dropdown remain clickable.
- Pressing `Escape` closes the dropdown.
- Clicking outside the selector closes the dropdown.
- The dropdown does not reopen unexpectedly after a satellite is selected.
- Hidden dropdown state does not intercept pointer events.
- The `Clear` button still works.
- Satellite search still filters results.
- Selected satellite summary still updates correctly.
- Enable `Show Orbit` for a selected satellite and rotate the camera so part of the orbit passes behind Earth.
- The behind-Earth orbit arc is fully occluded by the Earth sphere.
- The front-side orbit arc remains visible.
- No red orbit segment appears across the Earth surface unless it is genuinely in front of Earth.
- The orbit-occlusion fix works for at least one LEO satellite, one MEO satellite, and one GEO satellite.
- Selected-orbit material does not force foreground rendering with `depthTest: false`.
- Earth rendering continues to write depth so orbit occlusion works.
- The fixes do not break beam, footprint, satellite marker, Earth rendering, filters, timelines, YPR controls, or menu behavior.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.5

Improve satellite count visibility and make the accordion menu thinner.

The accordion menu is functional, but the satellite count in the `Filters - Satellites Found` header should stand out more, and the left menu should take less horizontal screen space.

Requirements:

1. Make the satellite count red and bold.
   - In the `Filters - Satellites Found: <count>` accordion header, style only the numeric satellite count.
   - The count must be red and bold.
   - Keep the rest of the header readable with the current expanded/collapsed accordion contrast rules.
   - Ensure the count remains red and bold when the `Filters` section is expanded and when it is collapsed.
   - Do not break live count updates from filtering or satellite loading.

2. Make the menu thinner.
   - Reduce the left menu width from the current value.
   - Keep all controls usable: filters, reset button, satellite search, YPR sliders, timeline checkboxes, metadata, and view controls.
   - Avoid clipping labels or buttons.
   - Preserve internal scrolling for long sections.
   - Preserve the narrow-viewport behavior where the menu stays below the time slider.
   - The time slider must remain readable and unobscured.

3. Preserve existing accordion behavior.
   - The vertical tab rail must remain removed.
   - The menu must remain stacked accordion sections.
   - Multiple sections must remain allowed to stay open simultaneously.
   - Expanding one section must not collapse any other section.
   - `Filters` and `Satellite Selection` must still start expanded on every `index.html` load.
   - Menu interactions must not reset accordion open/closed state.

4. Preserve existing visual behavior.
   - Keep the legacy accordion left accent colors.
   - Keep expanded accordion header text readable with the Version 1.5.4 contrast fix.
   - Keep collapsed accordion headers readable.
   - Keep the blue metallic/light selected tag-chip styling.
   - Keep the dark compact menu style.

5. Preserve existing app behavior.
   - Search, filters, reset filters, selected satellite summary, timelines, YPR controls, view toggles, orbit display, footprints, Mercator, and startup performance behavior must remain intact.
   - The `Active` tag/company chip must still be excluded.
   - Launch and re-entry timeline checkboxes must remain mutually exclusive.
   - YPR slider visibility and values must still persist after satellite selection.

6. Update tests.
   - Add or update tests asserting the satellite count span is styled red and bold.
   - Add or update tests asserting the menu width is thinner than the previous release value.
   - Keep existing tests for accordion structure, multi-open behavior, initial expanded sections, expanded-header contrast, legacy accents, mojibake scans, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

7. Update documentation.
   - Update `Test_and_Integration.md` with manual checks for the red bold satellite count and thinner menu.
   - Include a manual check that the time slider remains unobscured after narrowing the menu.
   - Update `README.md` if menu usage or appearance documentation changes.

Acceptance criteria:

- The satellite count in `Filters - Satellites Found` is red and bold.
- The menu is visibly thinner while still usable.
- Long accordion sections still scroll internally.
- The time slider remains readable and unobscured.
- Accordion behavior remains independent and multi-open.
- `Filters` and `Satellite Selection` still start expanded.
- Existing filtering, search, timeline, YPR, view, and startup behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.4

Fix low-contrast expanded accordion header text.

The current accordion menu introduced in Version 1.5.3 has a readability regression. Expanded accordion headers such as `Filters - Satellites Found` and `Satellite Selection` use light blue text on a light blue/metallic expanded background, making labels hard to read.

Requirements:

1. Improve expanded accordion header contrast.
   - Review `css/style.css` and the accordion header classes generated by `js/SatelliteMenuLoader.js`.
   - When an accordion section is expanded, its header text must remain clearly readable.
   - Do not use light blue text on a light blue background.
   - Prefer a dark navy/near-black text color for expanded headers, or adjust the expanded background so the existing text remains readable.
   - Keep the expanded state visually obvious.

2. Preserve the legacy accordion color style.
   - Keep the dark navy/blue collapsed accordion header style.
   - Keep the colored left accents:
     - `Filters`: blue.
     - `Satellite`: teal/green-blue.
     - `View`: yellow.
     - `Timelines`: pink/red.
     - `Other`: blue.
     - `Settings`: gray-blue.
   - Do not replace the menu with a new palette or generic browser accordion styling.
   - The fix should be a targeted contrast correction, not a redesign.

3. Check all accordion states.
   - Verify expanded `Filters` is readable.
   - Verify expanded `Satellite Selection` is readable.
   - Verify expanded `View`, `Timelines`, `Other Selections`, and `Settings` are readable.
   - Verify collapsed headers remain readable.
   - Verify the chevron/toggle marker remains visible in both expanded and collapsed states.

4. Preserve Version 1.5.3 behavior.
   - The vertical tab rail must remain removed.
   - The menu must remain stacked accordion sections.
   - Multiple sections must still be allowed to stay open simultaneously.
   - Expanding one section must not collapse any other section.
   - `Filters` and `Satellite Selection` must still start expanded on every `index.html` load.
   - Menu interactions must not reset accordion open/closed state.
   - Search, filters, reset filters, selected satellite summary, timelines, YPR controls, view toggles, and startup performance behavior must remain intact.

5. Update tests.
   - Add or update tests that assert expanded accordion header text uses a readable high-contrast color.
   - Add or update tests that ensure expanded header styling does not use light text on the light metallic background.
   - Keep existing tests for accordion structure, multi-open behavior, initial expanded sections, legacy left accents, mojibake scans, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

6. Update documentation.
   - Update `Test_and_Integration.md` with a manual visual check for expanded accordion header readability.
   - Include the screenshot scenario: `Filters - Satellites Found` and `Satellite Selection` expanded on page load must be readable.

Acceptance criteria:

- Expanded accordion headers are clearly readable.
- `Filters - Satellites Found` and `Satellite Selection` are readable on initial page load.
- Collapsed accordion headers remain readable.
- Legacy accordion color accents are preserved.
- Multiple accordion sections can still remain open at the same time.
- `Filters` and `Satellite Selection` still start expanded.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.3

Replace the current vertical tab menu layout with accordion-style menu sections.

The current menu uses a vertical tab rail for `Filters`, `Satellite`, `View`, `Timelines`, `Other`, and `Settings`. Replace that tabbed layout with stacked accordion sections that are easier to scan and use in the left menu.

Requirements:

1. Remove the vertical tab rail.
   - Do not use the current `role="tablist"`, `role="tab"`, and `role="tabpanel"` layout for the main menu sections.
   - Convert the same functional groups into accordion sections: `Filters`, `Satellite Selection`, `View`, `Timelines`, `Other Selections`, and `Settings`.

2. Use accessible accordion controls.
   - Each section header should be a clickable and keyboard-usable control.
   - Use `aria-expanded`, `aria-controls`, and stable section IDs.
   - Support mouse click, Enter, and Space for expanding/collapsing.
   - Keep visible focus styling.

3. Multiple sections must be allowed to stay open at the same time.
   - Very important: do not implement a single-open accordion.
   - Expanding one section must not collapse any other section.
   - Collapsing one section must not affect any other section.

4. Each section must collapse and expand independently.
   - Store open/closed state per section.
   - A section should only change state when the user interacts with that section header or when an explicit UX requirement needs that section visible.

5. Preserve section state while interacting with the menu.
   - Changing a filter must not collapse or expand unrelated sections.
   - Selecting a satellite must not reset accordion state.
   - Toggling checkboxes must not reset accordion state.
   - Clicking reset buttons, search clear buttons, timeline checkboxes, view toggles, or other menu buttons must not collapse the menu sections.
   - If Yaw-Pitch-Roll is enabled and satellite selection needs the YPR sliders discoverable, opening `Satellite Selection` is allowed, but no other section may be collapsed.
   - The open/closed state of each section should be preserved while interacting with the menu during the current page session.

6. Preserve the legacy menu color styling exactly.
   - Keep the existing dark navy/blue accordion-header visual style shown in the reference screenshot.
   - Preserve the current section color treatment, including the colored left accents:
     - `Filters`: blue.
     - `Satellite`: teal/green-blue.
     - `View`: yellow.
     - `Timelines`: pink/red.
     - `Other`: blue.
     - `Settings`: gray-blue.
   - Do not introduce a new color palette.
   - Do not restyle the accordion into a generic browser/default accordion.
   - The new accordion headers should visually match the legacy vertical menu section colors as closely as possible.

7. Initial page-load accordion state.
   - On every `index.html` load, `Filters` must start expanded.
   - On every `index.html` load, `Satellite Selection` must start expanded.
   - This must be true even if other accordion section state is remembered.
   - Do not allow persisted collapsed state to make `Filters` or `Satellite Selection` collapsed on initial load.
   - Other sections may start collapsed unless explicitly required otherwise.

8. Preserve existing Release 1.5.2 behavior.
   - No mojibake in menu labels, toggle labels, headings, helper text, time slider label, or buttons.
   - Keep the thinner menu width and internal scrolling behavior.
   - Keep the searchable satellite selector.
   - Keep filter reset, active-filter summary, and empty-state UX.
   - Keep generated `Active` tag/company chips excluded.
   - Keep selected tag chips styled with the blue metallic/light active style.
   - Keep launch and re-entry timeline checkboxes mutually exclusive.
   - Keep timeline checkbox state synchronized with actual HUD visibility.
   - Keep Yaw/Pitch/Roll slider visibility and values after satellite selection.
   - Keep startup performance/deferred timeline behavior intact.

9. Update tests.
   - Add or update tests proving the main menu no longer uses the vertical tab rail.
   - Test accordion headers expose independent `aria-expanded` state.
   - Test multiple accordion sections can be open at once.
   - Test expanding one section does not collapse another.
   - Test filters, satellite selection, checkbox toggles, reset buttons, and timeline toggles do not reset accordion state.
   - Add or update tests proving `Filters` and `Satellite Selection` are expanded on initial page load.
   - Add or update tests proving the legacy section color hooks/classes are still present.
   - Add or update tests proving accordion conversion does not remove the existing colored left-accent style.
   - Keep existing tests for mojibake, menu width, scrollable panels, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

10. Update documentation.
   - Update `README.md` if it describes the tabbed menu.
   - Update `Test_and_Integration.md` with manual accordion checks.
   - Include a manual check that multiple sections remain open after interacting with filters, satellite search, YPR controls, view toggles, and timeline toggles.

Acceptance criteria:

- The vertical tab rail is removed.
- The menu is organized as stacked accordion sections.
- The legacy dark navy/blue section-header color styling and colored left accents are preserved.
- `Filters` and `Satellite Selection` are expanded on every `index.html` load.
- Multiple accordion sections can remain open simultaneously.
- Expanding one section never collapses another section.
- Each section preserves its open/closed state during normal menu interactions.
- Existing filters, satellite search, timelines, YPR controls, view controls, and startup behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Manual accordion regression checks are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5.2

Fix menu text encoding regressions, menu width, tab order, timeline exclusivity, and Yaw/Pitch/Roll control persistence.

The screenshot shows user-facing mojibake and several menu UX regressions after the `1.5.1` menu redesign. Treat this as a targeted stabilization release. Preserve the tabbed menu, searchable satellite selector, filter reset/status UX, startup performance behavior, and existing satellite/orbit/timeline functionality while fixing the issues below.

Visible issues from the screenshot:

1. Malformed characters in UI labels.
   - The menu close/toggle button shows mojibake such as `âœ•`.
   - The time control label shows mojibake such as `Time Ã—`.
   - Search the full UI code for common mojibake sequences such as `â`, `Ã`, `Â`, replacement characters, and corrupted arrow/toggle glyphs.
   - Replace malformed user-facing characters with safe readable text.
   - Prefer simple ASCII where practical for fragile controls, for example:
     - Use `Menu`, `Close`, `X`, `v`, `>`, or equivalent safe labels instead of corrupted icons.
     - Use `Time x` or a correctly encoded `Time ×`, but only if encoding is verified.
   - Ensure headings, tab labels, helper text, toggle icons, time slider labels, and menu buttons render cleanly in the browser.
   - Keep all edited HTML, CSS, JavaScript, and Markdown files encoded consistently as UTF-8.
   - Add or update automated checks that fail on common mojibake patterns such as `â`, `Ã`, `Â`, or `�` in user-facing UI files.
   - Include a screenshot/manual verification step comparing the fixed menu against the problem screenshot, especially the red-circled menu button and time slider label.

2. Make the menu thinner.
   - Reduce the left menu width so it takes less horizontal screen space.
   - Keep the tab rail usable and readable.
   - Avoid making the menu so narrow that filters, reset button, search results, or satellite metadata become unusable.
   - Validate desktop and narrow viewport behavior.
   - If needed, reduce padding, tab width, gaps, and button sizes rather than hiding required controls.
   - Ensure long panels still scroll internally, especially satellite metadata, search results, and dense filter sections.
   - Confirm the thinner menu does not overlap, obscure, or make the time slider unreadable.

3. Fix tab/onglet order.
   - Move the `Other` tab/onglet so it appears immediately before `Settings`.
   - Keep a logical order such as `Filters`, `Satellite`, `View`, `Timelines`, `Other`, `Settings`.
   - Update keyboard tab navigation and persisted selected-tab logic if the tab order changes.
   - Ensure persisted old tab IDs still resolve safely after the change.

4. Make timeline selection mutually exclusive.
   - `Show Launch Timeline` and `Show Re-entry Timeline` should behave as exclusive checkbox toggles.
   - Checking `Show Launch Timeline` must uncheck and hide `Show Re-entry Timeline`.
   - Checking `Show Re-entry Timeline` must uncheck and hide `Show Launch Timeline`.
   - Unchecking the currently active timeline should hide that timeline.
   - Only one timeline HUD may be visible at a time.
   - If needed, update timeline modules to expose or internally support reliable `show`/`hide` behavior so checkbox state and actual HUD visibility cannot diverge.
   - Preserve deferred timeline loading states from Release `1.5`: disabled/loading checkboxes should not be toggled while their data is still preparing.
   - Preserve selecting a satellite from either timeline.

5. Preserve Yaw/Pitch/Roll sliders after satellite selection.
   - Investigate why selecting a satellite causes the Yaw/Pitch/Roll sliders to disappear, reset, or become inaccessible.
   - If the Yaw-Pitch-Roll checkbox is enabled, selecting a satellite must keep the yaw, pitch, and roll sliders visible and usable.
   - Selecting a satellite must not switch away from the Satellite tab, collapse the Satellite Selection panel, reset the YPR checkbox, or hide the sliders.
   - If YPR is enabled and satellite selection happens from another tab or timeline, either keep the Satellite tab visible or automatically return to the Satellite tab so the sliders remain discoverable.
   - Switching satellites should preserve current yaw, pitch, and roll slider values unless the user explicitly resets them.
   - YPR frame/model orientation should still update for the newly selected satellite.
   - If no satellite is selected, YPR controls may remain visible but should communicate that they require a selected satellite, or they may be disabled consistently.

6. Verify previous menu acceptance items still hold.
   - The `Active` tag/filter chip should not appear as a filter control if it is still being generated from data.
   - Filter out `Active` from generated tag/company chips, not only from static menu markup.
   - Selected tag chips should keep the blue metallic/light active style.
   - Searchable satellite selection, reset filters, active filter summary, and empty states should still work.
   - `Other Selections` should remain collapsible and blue-styled.
   - Startup performance instrumentation and deferred startup behavior should remain intact.

7. Update tests and documentation.
   - Add or update tests that fail if mojibake appears in generated menu markup, `index.html` UI labels, or timeline labels.
   - Add or update tests that scan edited UI files for common mojibake sequences and replacement characters.
   - Add tests for thinner menu CSS constraints or expected menu width tokens.
   - Add tests that the menu and long panels retain scrollable overflow after narrowing.
   - Add tests for the tab order: `Other` must appear before `Settings`.
   - Add tests proving timeline checkboxes are mutually exclusive.
   - Add tests that checkbox state and timeline HUD visibility stay synchronized.
   - Add tests proving YPR slider visibility is not reset by satellite selection logic when YPR is enabled.
   - Add tests that generated filter/tag chips exclude `Active`.
   - Update `Test_and_Integration.md` with manual checks for text encoding, thinner menu layout, timeline exclusivity, and YPR persistence after satellite selection.
   - Add a manual screenshot comparison checklist for the red-circled mojibake areas in the provided screenshot.
   - Add a manual check that the time slider remains readable and unobscured after menu narrowing.
   - Update `README.md` if menu/timeline behavior documentation changes.
   - Update the visible version in `index.html` to match this release.

Acceptance criteria:

- No visible mojibake remains in the menu, time slider label, tab labels, toggle labels, headings, or helper text.
- Automated mojibake scans pass for UI-facing HTML, CSS, JavaScript, and Markdown files touched by the release.
- The menu is visibly thinner while still usable.
- Long menu panels remain scrollable after narrowing.
- The time slider remains readable and unobscured by the menu.
- The tab order places `Other` immediately before `Settings`.
- Timeline checkboxes are mutually exclusive and only one timeline can be visible at a time.
- Unchecking the active timeline hides it.
- Timeline checkbox state always matches actual timeline HUD visibility.
- Yaw/Pitch/Roll sliders remain visible after selecting or switching satellites when the YPR toggle is enabled.
- If YPR is enabled, satellite selection does not leave the sliders hidden in another tab or collapsed section.
- Yaw/Pitch/Roll values are preserved across satellite selection unless explicitly reset by the user.
- The `Active` tag/filter chip is not shown as a filter control.
- `Active` is filtered out from generated tag/company chips, not just static markup.
- Search, filters, reset filters, selected satellite summary, model loading, orbit display, footprints, Mercator, day/night, ECEF axes, and startup performance behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Browser/manual verification results are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5.1

Improve menu readability, filter styling, and control layout.

The left menu in `index.html` should be easier to scan and use. Redesign the relevant menu sections without changing the underlying satellite filtering, selection, timeline, orbit, footprint, or view behavior.

Requirements:

1. Improve overall menu readability.
   - Review `js/SatelliteMenuLoader.js`, `css/style.css`, and related menu code in `index.html`.
   - Make section spacing, labels, button states, checkbox alignment, and dropdown placement easier to read.
   - Preserve the existing dark compact style, but improve visual hierarchy and active-state contrast.
   - Ensure the menu remains usable at narrow viewport widths.

2. Add tabbed menu navigation inspired by the reference image.
   - Add `onglets`/tabs to the menu, using the attached reference image as inspiration rather than a pixel-perfect copy.
   - Prefer a compact vertical tab rail with colored tab labels along the left edge of the menu, similar to the reference.
   - Organize controls into clear tabs such as `Filters`, `Satellite`, `View`, `Timelines`, `Other`, and `Settings` or equivalent names that fit the current app.
   - Keep the default tab focused on the most common startup workflow, likely `Filters` or `Satellite`.
   - Switching tabs should show the selected tab panel and hide the other tab panels without losing control state.
   - Use accessible tab semantics where practical: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, and keyboard navigation.
   - Make the active tab visually obvious with a blue/light metallic style that fits the updated menu.
   - Ensure tab labels remain readable and do not consume too much horizontal space.
   - On narrow screens, keep the tabs usable by allowing the tab rail to scroll or by converting it to a compact horizontal tab strip.

3. Add practical UX improvements while changing the menu.
   - Add clearer loading/disabled states for controls that depend on deferred startup data.
   - Add short helper text or tooltips for ambiguous controls such as orbit filters, debris modes, timelines, and `Other Selections`.
   - Add an obvious reset/default action for filters if it can be implemented without clutter.
   - Keep a concise visible status for selected satellite and satellite count.
   - Avoid adding visual noise; prioritize scanability over decoration.

4. Add a searchable satellite selector.
   - Replace or enhance the current `Select Satellite` dropdown with a searchable combobox/typeahead.
   - Search by satellite name, NORAD ID, orbit type, and company/tag.
   - Keep the selector usable with keyboard navigation: arrow keys, Enter, Escape, and Tab.
   - Show a clear empty state such as `No satellites match this search`.
   - Add a clear/reset search affordance.
   - Preserve existing selection behavior, detailed model loading, selected marker highlighting, Mercator selected state, orbit display, and timeline selection.

5. Add better filter reset, active-summary, and empty-state UX.
   - Add a visible `Reset Filters` action.
   - Reset filters to the documented defaults: Orbit `MEO`, Tags `All tags`, Debris `Show`.
   - Do not clear the selected satellite unless it no longer matches the reset state or clearing is required for consistency.
   - Show a compact active-filter summary such as `MEO + Starlink + Debris hidden | 243 satellites`.
   - If filters return zero satellites, show a clear empty state such as `No satellites match these filters`.
   - Include a shortcut from the empty state to reset filters.

6. Persist menu UI state where useful.
   - Remember the last selected tab/onglet across reloads.
   - Remember collapsed/expanded menu sections where practical.
   - Do not persist transient loading states.
   - Ensure persisted menu state never overrides valid satellite/filter state unexpectedly.

7. Improve accessibility and interaction polish.
   - Add visible focus outlines for tabs, chips, checkboxes, dropdown/combobox, and timeline toggles.
   - Ensure tab switching works from the keyboard.
   - Add ARIA labels or descriptions for tab panels, timeline toggles, filter reset, search field, and empty states.
   - Keep controls usable when satellite data or deferred timeline data is still loading.

8. Remove `Active` controls from filters.
   - Remove any remaining `Active` tag/filter button or control from the filter UI.
   - Confirm removing it does not break saved state, filter normalization, count updates, marker visibility, or dropdown population.
   - Keep valid filter controls for Orbit, Tags, and Debris.

9. Improve selected tag button styling.
   - When a tag chip is selected, make it visibly active with a brighter blue metallic/light style.
   - The selected state should be obvious but still readable against the dark menu.
   - Preserve keyboard accessibility and clear checked/pressed states.

10. Make `Other Selections` blue and collapsible.
   - Style the `Other Selections` section header/control with a blue visual treatment.
   - Make the section collapsible like the other menu sections.
   - Confirm expanding/collapsing does not reset the selected `Earth`/`Moon` state.

11. Reorganize satellite selection controls.
   - Keep a clear `Satellite Selection` section.
   - Place the `Select Satellite` label and satellite dropdown combo directly between the `Satellite Selection` section title and the related checkboxes.
   - Keep related checkboxes such as footprint, show-only-selected, orbit frame, yaw/pitch/roll, and similar satellite-specific controls grouped logically below the combo.
   - Do not break satellite selection, detailed model loading, selected-satellite highlighting, orbit display, Mercator selected state, or timeline selection.

12. Move timeline controls after `Other Selections`.
   - Move `Show Launch Timeline` and `Show Re-entry Timeline` controls so they appear after the `Other Selections` section.
   - Replace button-style timeline toggles with checkbox-style toggles.
   - A checked checkbox should show/open the corresponding timeline.
   - An unchecked checkbox should hide/close the corresponding timeline.
   - Preserve existing timeline behavior, including selecting a satellite from either timeline.
   - Ensure Release 1.5 deferred startup behavior still works with checkbox toggles: disabled/loading states must remain clear while timeline data is preparing.

13. Update tests and documentation.
   - Add or update tests for the generated menu structure.
   - Test the tab rail/tab strip exists and exposes accessible tab semantics.
   - Test tab switching hides inactive panels without resetting selected filters or selected satellite state.
   - Test searchable satellite combobox behavior, including name, NORAD ID, orbit type, and company/tag search.
   - Test keyboard navigation for tabs and satellite search.
   - Test `Reset Filters`, active-filter summary, and zero-result empty state.
   - Test persisted tab/collapse state without persisting transient loading states.
   - Test that no `Active` filter/tag control remains.
   - Test selected tag chips expose a distinct active class/state that can be styled blue.
   - Test `Other Selections` is collapsible and styled with a blue class or equivalent.
   - Test timeline controls are checkboxes and appear after `Other Selections`.
   - Test the satellite dropdown appears before the satellite-specific checkboxes.
   - Update `Test_and_Integration.md` with menu readability, tab navigation, layout, timeline checkbox, and responsive checks.
   - Update `README.md` if controls or menu usage documentation changes.
   - Update the visible version in `index.html` to match this release.

Acceptance criteria:

- The menu is more readable, with clearer spacing and visual hierarchy.
- The menu includes compact `onglets`/tabs inspired by the reference image.
- Tabs are accessible, visually clear, and usable on desktop and narrow screens.
- Switching tabs does not reset filter, selection, view, timeline, or other control state.
- Ambiguous controls have better labels, helper text, tooltip text, or status feedback where practical.
- Satellite selection is searchable by name, NORAD ID, orbit type, and company/tag.
- Satellite search supports keyboard navigation and clear empty states.
- A `Reset Filters` action restores documented filter defaults.
- Active filter state is summarized in a compact, readable status line.
- Zero-result filter/search states provide a useful message and reset shortcut.
- Last selected tab and useful collapsed-section state persist across reloads without preserving transient loading state.
- Focus states and ARIA labels make tabs, filters, search, and timeline toggles more accessible.
- No `Active` filter/tag button or control remains in the filter menu.
- Selected tag chips use a clear blue metallic/light active style.
- `Other Selections` is blue-styled and collapsible.
- `Select Satellite` and the satellite dropdown sit between the `Satellite Selection` header and the related checkboxes.
- `Show Launch Timeline` and `Show Re-entry Timeline` appear after `Other Selections`.
- Timeline controls are checkbox toggles, not button toggles.
- Checking a timeline checkbox opens/shows that timeline; unchecking it hides/closes the timeline.
- Timeline loading/deferred startup states remain clear and usable.
- Existing filtering, satellite selection, model loading, orbit display, footprints, Mercator, day/night, ECEF axes, and timeline satellite selection still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Browser/manual menu checks are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5

Optimize `index.html` page-load performance.

The current application takes too long to load when opening `index.html`. Investigate the full startup path and reduce the time to first usable render without breaking existing satellite simulation, rendering, filtering, orbit display, Mercator, model loading, or timeline behavior.

Start by measuring the current load path before making changes. Identify which parts of startup are slow, including HTML parsing, JavaScript module loading, Three.js/addon imports, TLE or JSON loading, satellite marker creation, local model discovery, texture/model loading, filter/dropdown population, Mercator setup, and first-frame rendering.

Requirements:

1. Add repeatable performance measurement.
   - Measure baseline load timing for `index.html` over a local HTTP server.
   - Capture at least DOMContentLoaded, full load, first visible globe render, satellite data ready, and first interactive UI state where practical.
   - Prefer browser Performance API instrumentation or a small debug timing helper that can be disabled or kept low-noise.
   - Document the baseline and final measurements in `Test_and_Integration.md`.

2. Reduce blocking startup work.
   - Defer non-critical work until after the first globe render.
   - Avoid loading detailed satellite models, large optional assets, or expensive derived data during initial page load unless required for the first view.
   - Lazy-load selected-satellite models only when a satellite is selected.
   - Keep the initial UI responsive while satellite data and optional visuals continue loading.

3. Optimize data loading and processing.
   - Review TLE, JSON, metadata, and filter/tag loading for unnecessary repeated fetches or parsing.
   - Cache reusable parsed data in memory.
   - Avoid rebuilding satellite dropdowns, filters, geometries, or lookup maps more often than needed.
   - Preserve accurate satellite propagation and current filter behavior.

4. Optimize initial rendering.
   - Render a usable globe and menu as early as possible.
   - Batch satellite marker creation where practical to avoid long main-thread stalls.
   - Avoid expensive per-satellite work before the first frame unless it is required for correctness.
   - Confirm animation-loop changes do not introduce visual stutter, stale satellite positions, or broken orbit/footprint updates.

5. Preserve current behavior.
   - Existing 3D globe rendering, Mercator view, filters, satellite selection, `Show Orbit`, footprints, day/night, ECEF axes, detailed selected models, and timelines must keep working.
   - Do not remove features to improve load time unless a feature is explicitly optional and remains available through lazy loading.
   - Do not reduce orbital accuracy or replace TLE propagation with approximate placeholders.

6. Add focused tests or checks.
   - Add automated tests for any new caching, lazy-loading, or startup-state helpers.
   - Add regression checks proving deferred startup work still completes and updates the UI correctly.
   - Keep existing tests passing.

7. Update documentation and versioning.
   - Update the visible version in `index.html` to match this release.
   - Update `Test_and_Integration.md` with performance baseline, final measurements, manual browser checks, and any known limitations.
   - Update `README.md` if startup behavior, lazy loading, local server usage, or diagnostics changed.

Acceptance criteria:

- `index.html` reaches a visible, usable initial render faster than the measured baseline.
- Initial page load does not block on selected-satellite model loading or other non-critical assets.
- Satellite data, filters, dropdown, globe, and clock become usable without long main-thread freezes.
- Deferred work completes correctly after startup.
- Selecting a satellite still loads any available detailed model on demand.
- `Show Orbit`, Mercator ground track, footprints, filters, day/night, ECEF axes, timeline controls, and satellite switching still work.
- No new console errors are introduced.
- `npm test` passes.
- JavaScript syntax checks pass.
- Performance measurements and manual verification results are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.4.5

Analyze the attached screenshot and fix the remaining `Show Orbit` rendering issues. Also update the filter menu behavior.

Important clarification:
This does not appear to be primarily an orbit calculation problem. The GEO orbit radius looks plausibly large enough, but the red 3D orbit line is rendered visually on top of the Earth instead of being hidden when it is behind the globe. Treat this first as a rendering/depth/occlusion/layering issue, not as a TLE propagation or orbital-radius issue.

Visible issues:

1. GEO 3D orbit rendering:
   - Selected satellite: `INTELSAT 10-02`.
   - The red GEO orbit line appears to cut across the Earth.
   - The likely issue is that the orbit line is drawn through/on top of the Earth because of depth testing, render order, material settings, or scene layering.
   - If part of the orbit is behind Earth from the camera viewpoint, Earth should occlude it.
   - Do not "fix" this by changing the physical GEO orbit radius unless a test proves the radius is wrong.

2. Mercator ground track:
   - The Mercator inset shows the selected satellite and footprint rings.
   - The selected satellite orbit/ground track is not visible.
   - When `Show Orbit` is enabled, Mercator must show a visible selected-satellite ground track.
   - For GEO satellites, if the ground track is almost stationary, show a clear small segment, marker, or GEO track fallback that is visible at the inset size.

3. Filter menu updates:
   - Remove the `Active` button/control from the filter menu.
   - Add an `ALL` option to the Orbit filter, alongside `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
   - Selecting `ALL` should enable all orbit categories.
   - Selecting a specific orbit category should clear `ALL` unless the intended behavior is explicitly documented otherwise.
   - The default orbit filter can remain `MEO` unless the app requirements say otherwise.
   - Update filtering logic, UI state, and tests so `ALL` behaves consistently.

Please investigate:

- Whether the 3D orbit material has `depthTest: false`, `depthWrite: false`, transparent rendering, high `renderOrder`, or another setting that makes it draw over Earth.
- Whether Earth material or renderer settings prevent proper depth occlusion.
- Whether the orbit line is being added to a scene/layer that bypasses normal depth testing.
- Whether the first orbit sample still matches the selected satellite's current propagated scene position.
- Whether GEO orbit radius is physically plausible, only as a verification step.
- Whether Mercator ground-track points are generated but hidden, too small, covered by footprint rings, cleared every frame, or drawn in the wrong order.
- Where the `Active` filter button is generated and whether removing it affects saved filter state or tests.
- Whether the orbit filter normalization already has partial `ALL` support that only needs a visible button.

Acceptance criteria:

- GEO orbit is physically unchanged unless proven wrong.
- 3D orbit line is properly occluded by Earth when behind the globe.
- The visible portion of the orbit no longer appears to cut through Earth.
- First orbit point still aligns with the selected satellite marker/model.
- Mercator ground track is visible when `Show Orbit` is enabled.
- GEO satellites have a visible Mercator fallback if the true ground track is nearly stationary.
- `Active` button/control is removed from the filter menu.
- Orbit filter includes `ALL`, `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- `ALL` selects all orbit categories and updates count, markers, dropdown, and tags correctly.
- Selecting specific orbit categories behaves predictably with `ALL`.
- Switching satellites refreshes both 3D orbit and Mercator ground track.
- Turning `Show Orbit` off clears both 3D and Mercator orbit/track visuals.
- Add or update tests for orbit rendering assumptions, GEO radius sanity, Mercator GEO track visibility, and Orbit filter `ALL` behavior.
- Update `README.md` and `Test_and_Integration.md`.
- Document manual screenshot verification in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.4.4

Fix the "Show orbit" regression while keeping `satellite.js@6.0.2`.

When a satellite is selected and `Show orbit` is enabled, the 3D orbit trajectory must remain physically coherent and the Mercator ground track must render reliably for the selected satellite. Recent release work introduced selected-model visibility changes and shared frame utilities; verify those changes did not break orbit rendering or selected-satellite state.

Requirements:

1. Harden 3D orbit trajectory generation.
   - In `js/satelliteTLELoader.js`, reject propagated positions whose `x`, `y`, or `z` values are not finite before adding them to orbit geometry.
   - Do not create `THREE.BufferGeometry` with `NaN`, `Infinity`, or missing position values.
   - Stop or split the generated path when propagation becomes invalid or when the propagated radius is below Earth.
   - Keep the first generated orbit point aligned with the selected satellite's current propagated scene position.

2. Harden Mercator ground-track generation.
   - In `js/mercatorMapLoader.js`, reject non-finite propagated positions and non-finite geodetic latitude/longitude before drawing.
   - Do not connect line segments across invalid samples, antimeridian jumps, or decayed/below-Earth samples.
   - Keep the Mercator ground track synchronized with the current simulation time.

3. Fix selected-satellite state for Mercator.
   - The Mercator selected satellite must not depend only on sprite visibility.
   - If a detailed 3D model is displayed and the sprite is hidden, Mercator must still identify and draw the selected satellite and its ground track.
   - Persist a stable selected NORAD ID or equivalent state in `simParams`, and use it as the first-choice selected-satellite lookup.

4. Preserve current 3D selected-model behavior.
   - Keep the selected sprite visible while a detailed model loads.
   - Hide the sprite only after the detailed model is confirmed visible.
   - If detailed model loading fails, preserve the selected sprite and orbit behavior.

5. Add focused tests.
   - Add or update orbit-generation tests proving non-finite propagation samples are skipped or split safely.
   - Add tests proving below-Earth propagated samples do not create lines through Earth.
   - Add Mercator selection tests proving a selected satellite can be found by stable selected NORAD ID even when its mesh is hidden.
   - Keep existing tests passing.

6. Update documentation and verification.
   - Update the visible version in `index.html` to match this release.
   - Update `Test_and_Integration.md` with the new orbit and Mercator regression checks.
   - Update `README.md` if controls, testing, release/versioning, or known limitations changed.
   - Run `npm test` and JavaScript syntax checks.

Acceptance criteria:

- `Show orbit` produces no non-finite vertices in 3D orbit geometry.
- Invalid/decayed/below-Earth propagation samples do not create lines through Earth.
- Mercator ground track renders for the selected satellite even when a detailed 3D model hides the sprite.
- Switching satellites refreshes both the 3D orbit and Mercator ground track.
- Turning `Show orbit` off clears 3D orbit geometry and stops drawing the Mercator ground track.
- No new console errors are introduced.

---

## Release Date: 2026-06-03  Version 1.4.3

Clean up prompt/release structure and update Three.js versioning.

Requirements:

1. Keep `PROMPT.md` focused.
   - `PROMPT.md` must contain only the `General Execution Prompt` section.
   - Move all release-specific prompts, release requirements, and release history into `PROMPT_History.md`.
   - Do not duplicate release history in `PROMPT.md`.

2. Keep release versioning synchronized.
   - For every new release in `PROMPT_History.md`, update the visible version tag in `index.html`.
   - The `index.html` version number must always match the latest release version from `PROMPT_History.md`.
   - Example: if the latest release is `Version 1.4.2`, `index.html` must display `1.4.2`.

3. Update Three.js import map.
   - Verify the current latest stable `three` version from npm before changing it.
   - Update both core Three.js and addons to the same version.
   - Do not mix versions between `three` and `three/addons`.

Expected import map format:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"
  }
}
</script>
```

4. Verify compatibility.
   - Confirm `OrbitControls`, `OBJLoader`, `MTLLoader`, `GLTFLoader`, and `CSS2DRenderer` still load correctly after the Three.js update.
   - Confirm `index.html` and `display_satellite.html` still load over HTTP.
   - Run `npm test`.
   - Run JavaScript syntax checks.
   - Update `Test_and_Integration.md` with any new verification steps or known limitations.
   - Update `README.md` if setup, dependencies, versioning rules, or documentation structure changed.

Acceptance criteria:

- `PROMPT.md` contains only `General Execution Prompt`.
- `PROMPT_History.md` contains all release history.
- `index.html` displays the latest release version.
- `three` and `three/addons/` use the same latest verified version.
- Tests and HTTP smoke checks pass or limitations are documented.

---

## Release Date: 2026-06-03  Version 1.4.2

Fix the 3D selected-satellite model visibility regression.

When selecting a satellite that has a related local OBJ/MTL or GLB model, the model must be clearly visible in the 3D scene. The camera/observer should move close to the selected satellite, targeting an apparent real-world distance of about 100 meters, with Earth centered behind the satellite.

Investigate why the selected model is not visually appearing or is too small, hidden, transparent, clipped, incorrectly positioned, incorrectly scaled, incorrectly oriented, outside the camera view, or obscured by sprite/model visibility logic.

Requirements:

1. Verify model resolution and loading.
   - Confirm the correct local asset is resolved from `./obj`.
   - Confirm Starlink resolves to the Starlink model.
   - Confirm OneWeb, O3b, ISS, and SSL 1300 fallback mappings still work.
   - Log the selected satellite name, NORAD ID, resolved asset path, metadata path, and load result.

2. Verify the model is actually visible in 3D.
   - Confirm the model is added to the active Three.js scene.
   - Confirm it has visible geometry, materials, nonzero bounding box, and nonzero scale.
   - Confirm it is not transparent, fully black, unlit, frustum-culled, behind Earth, or clipped by camera near/far planes.
   - Add fallback material or lighting if textures/materials fail.

3. Fix selected-satellite camera framing.
   - Move the observer/camera close to the selected satellite, targeting approximately 100 meters.
   - Convert 100 meters into scene units using the app scale.
   - If the app's visual scaling makes the literal distance unusable, use a documented visual fallback while preserving the intended close-satellite view.
   - The selected model should be centered and large enough to see clearly, with Earth visible and centered behind it.
   - Camera controls should not immediately fight or reset the selected-satellite framing.

4. Fix selected model placement and updates.
   - Position the loaded model at the selected satellite's propagated position.
   - Keep the model following the selected satellite as simulation time advances.
   - Apply nadir/Earth-facing orientation and yaw/pitch/roll consistently.
   - Ensure rapid satellite selection does not display stale models.

5. Preserve fallback behavior.
   - Keep the selected sprite visible while the model loads.
   - Hide the sprite only after the detailed model is confirmed visible.
   - If the model fails to load or cannot be made visible, keep the selected sprite visible and selected.

6. Add visual verification tests.
   - Use or create an isolated model viewer such as `display_satellite.html` to load the Starlink model directly from `./obj`.
   - Verify Starlink is visually visible in `display_satellite.html`.
   - Compare the isolated viewer behavior with `index.html` selection behavior.
   - Add a browser/manual test that selects a Starlink satellite in `index.html` and confirms the detailed model is visible, centered, and close to the camera.
   - Where practical, add automated or screenshot-based checks that confirm the rendered selected model is not blank and occupies a meaningful screen area.

Update `Test_and_Integration.md` with these checks.

Acceptance criteria:

- Selecting a Starlink satellite visibly shows the Starlink 3D model in `index.html`.
- The camera moves close to the model, approximately 100 meters apparent observer distance, with Earth centered behind it.
- The model remains visible while simulation time advances.
- `display_satellite.html` or an equivalent isolated viewer can visually display the Starlink model from `./obj`.
- If the detailed model cannot be displayed, the selected sprite remains visible.
- Existing orbit, footprint, camera, Mercator, and yaw/pitch/roll behavior still works.

---

## Release Date: 2026-06-03  Version 1.4.1

Fix 3D model loading for selected satellites.

When a satellite is selected in `index.html`, the app should display its related local 3D model when one exists under `./obj`. For example, Starlink satellites should load the available Starlink OBJ/MTL or GLB model instead of showing only the default satellite sprite.

Inspect the full satellite-selection and model-loading flow, including `index.html`, `js/satelliteModelLoader.js`, satellite metadata under `json/satellites/`, and local assets under `obj/`.

Requirements:

1. Build a deterministic model-resolution strategy.
   - Match by NORAD ID when metadata exists.
   - Fall back to normalized satellite name, company/tag, or known constellation aliases such as `starlink`, `oneweb`, `o3b`, `iss`, and `ssl_1300`.
   - Matching must be case-insensitive and robust to spaces, hyphens, underscores, and file extensions.

2. Support local model assets.
   - Load OBJ/MTL pairs from `./obj`.
   - Load GLB files from `./obj`.
   - Prefer exact metadata mappings over generic constellation fallback models.
   - Do not depend on remote GitHub model files when a local model exists.

3. Fix selected-satellite display behavior.
   - Keep the fallback sprite visible while the model is loading.
   - Hide or de-emphasize the sprite only after the detailed model successfully loads.
   - If model loading fails, keep the sprite selected and visible.
   - Position, scale, and orient the loaded model at the selected satellite's current propagated position.
   - Keep the model updated as simulation time advances.

4. Prevent async selection bugs.
   - If the user selects another satellite while a model is still loading, ignore the stale load result.
   - Do not show a model for a previously selected satellite after selection changes.

5. Improve diagnostics.
   - Log which model path was attempted.
   - Log why a model was not found.
   - Log whether fallback sprite display was used.

6. Verify known local models.
   - Starlink satellites use the Starlink model in `./obj`.
   - OneWeb satellites use the OneWeb model when available.
   - O3b satellites use the O3b model when available.
   - ISS uses the ISS model when available.
   - GEO satellites with SSL 1300-style fallback mappings still load correctly.

7. Update tests and documentation.
   - Add automated tests for model-resolution logic where practical.
   - Update `Test_and_Integration.md` with manual checks for selecting Starlink, OneWeb, O3b, ISS, and a satellite without a model.
   - Update `README.md` if model asset conventions or limitations need documentation.

Acceptance criteria:

- Selecting a Starlink satellite visibly loads a Starlink 3D model from `./obj`.
- The selected model appears in the correct 3D position and follows the satellite over time.
- The app never leaves the user with no visible selected satellite if model loading fails.
- Switching selections quickly does not display the wrong model.
- Existing orbit, footprint, camera, and yaw/pitch/roll behavior still works.

---

## Release Date: 2026-06-03  Version 1.4

Improve selected-satellite framing, observer positioning, and Earth-facing orientation.

When a satellite is selected in 3D mode, smoothly move the observer/camera near the selected satellite, targeting an apparent real-world distance of approximately 75 to 100 meters from the satellite. Convert this distance into the app's scene units using the existing Earth/satellite scale model, and document the conversion or approximation if exact real-world scaling is not practical.

Frame the selected satellite clearly in the foreground while keeping Earth centered behind it. The final camera position should avoid clipping, keep the satellite readable, and make Earth visually prominent enough that the user immediately understands the satellite's relationship to Earth.

Orient the selected satellite so it is nadir-pointing toward Earth, meaning the configured Earth-facing axis of the satellite model points toward Earth's center. Define and document the model axis used for this orientation. Apply yaw, pitch, and roll consistently in the same scene coordinate frame used for satellite position, Earth position, orbit trails, and camera placement.

For 2D/Mercator mode, implement equivalent selected-satellite UX: center or highlight the selected satellite, keep the Earth/map context visible, and avoid applying 3D-only camera-distance logic where it does not make sense.

Preserve user control. The automatic camera move should happen on satellite selection or when an explicit follow/observer mode is enabled, but it should not continuously fight manual camera movement unless the user has enabled tracking.

Verify the behavior for LEO, MEO, GEO, and fast-moving satellites. Confirm that switching selected satellites, toggling between 2D and 3D views, enabling/disabling yaw-pitch-roll controls, and changing time/timeline state all keep the selected-satellite framing and Earth-facing orientation coherent.

Update `Test_and_Integration.md` with the new selected-satellite camera, orientation, 2D/3D view-switching, and manual-control regression checks. Add focused automated tests for reusable orientation/framing math where practical, and document any remaining visual-only limitations.

---

## Release Date: 2026-06-02  Version 1.3

Fix the issues found in the latest `openbexi_earth_orbit` code review and bring the app back to a fully tested state.

This is a broad physics/rendering refactor. Before implementing it, inspect `git status` and preserve the current filter/test-plan work by committing it, stashing it, or clearly documenting why it is safe to continue in the dirty worktree. Do not mix unrelated untracked/generated files into this work.

Implement Version 1.3 in small phases, with tests added before or alongside each phase:

1. Shared coordinate utilities and deterministic coordinate-frame tests.
2. 3D orbit trail alignment fixes and orbit-generation tests.
3. Sun/day-night frame fixes and Sun-direction tests.
4. Moon positioning and satellite model scaling fixes with domain tests.
5. UI cleanup fixes for duplicate View IDs, Yaw/Pitch/Roll visibility, and URL helper hardening.
6. Browser smoke testing and the full `Test_and_Integration.md` checklist.

After each major phase, run the relevant automated tests and update `Test_and_Integration.md` if the accepted procedure changes. Before reporting completion, go through `Test_and_Integration.md` from top to bottom and make sure every required automated test, browser smoke test, and manual regression item either passes or is explicitly documented as a remaining limitation.

### Required Fixes

1. Unify coordinate-frame handling across the app.
   - Define one clear scene-coordinate convention for Earth, satellites, orbit paths, Sun/day-night lighting, Moon, footprints, ECEF axes, orbit frame, and Mercator conversions.
   - Ensure live satellite markers, detailed satellite models, 3D orbit trails, footprints, Sun direction, and Moon position use consistent transforms.
   - Eliminate duplicated or contradictory ECI/ECEF/scene transform logic where practical.

2. Fix 3D orbit trail alignment.
   - Orbit lines must pass through the currently selected satellite marker/model at the current simulation time.
   - Use the same simulation date and scene transform as the live satellite update.
   - Avoid special GEO logic that leaves the orbit in a different frame unless it is physically justified and documented.

3. Fix 3D day/night and Sun direction.
   - Ensure the Sun vector, directional light, visible Sun, Earth rotation, and satellite positions are all in the same scene frame.
   - Confirm the rendered terminator is consistent with UTC time and Earth longitude.

4. Fix Moon positioning.
   - Either implement a more accurate low-precision lunar ephemeris or clearly isolate the current Moon as an approximate visual aid.
   - In either case, ensure its coordinates use the same scene transform convention as the rest of the 3D scene.

5. Fix satellite model scaling.
   - Remove hardcoded duplicate scale constants from `satelliteModelLoader.js`.
   - Import shared scale constants from `SatelliteConstantLoader.js`.
   - Make OBJ/GLB scale handling consistent.
   - Remove ignored scale calculations and undocumented legacy multipliers, or replace them with a named documented visual-scale factor.

6. Fix or remove broken `getOrbitECIPoints()`.
   - If kept, initialize its point array correctly, make it return useful data, and add a focused test.
   - If unused and unnecessary, remove it safely.

7. Fix duplicate `viewContent` IDs in the menu.
   - The View section must use one unique collapsible container containing all View controls.
   - Confirm Globe, Mercator, High Def., ECEF Axes, and Day/Night all collapse/expand together.

8. Fix Yaw/Pitch/Roll slider visibility.
   - Sliders should be hidden until the Yaw-Pitch-Roll toggle is enabled.
   - Toggling off should hide sliders and hide the YPR frame.
   - Toggling on should show sliders and update labels/frame state correctly.

9. Harden `getFullGitHubUrl()`.
   - Invalid or non-string paths must not throw.
   - Return `null` or a safe fallback consistently.

### Deep Test Requirements

Add focused automated tests for the fixes, not only browser smoke checks.

Required test coverage:

1. Coordinate-frame consistency:
   - Test that shared ECI/ECEF/scene transform functions produce consistent positions for the same satellite/time.
   - Test that a selected satellite marker and its generated orbit trail agree at the current simulation time within a small tolerance.
   - Test GEO, MEO, and LEO examples.

2. Orbit trail generation:
   - Test that orbit path generation starts from the simulation time, not wall-clock `Date.now()`.
   - Test that orbit path points are finite, non-empty, and scaled in scene units.
   - Test that switching selected satellites clears the old orbit geometry.

3. Day/night and Sun direction:
   - Test Sun vector normalization.
   - Test GMST conversion stays in `[0, 2 * Math.PI)`.
   - Test that the 3D Sun/light direction uses the same scene-frame transform convention as satellites.

4. Moon positioning:
   - Test Moon position returns finite scene coordinates.
   - Test Moon distance is within expected bounds.
   - If Moon remains approximate, add a test that documents the approximation and validates the expected model behavior.

5. Satellite model scaling:
   - Test OBJ/GLB unit conversion helpers for `m`, `cm`, `mm`, `km`, and numeric factors.
   - Test model visual scale is applied once and is named/configurable.

6. Footprint rendering math:
   - Test footprint angular radius for LEO, MEO, and GEO altitudes.
   - Test no NaN/Infinity values for valid satellite positions.
   - Test invalid/below-surface positions are rejected safely.

7. Menu/UI state:
   - Test there are no duplicate IDs in generated menu markup.
   - Test View collapse includes Globe, Mercator, High Def., ECEF Axes, and Day/Night controls.
   - Test YPR sliders are hidden by default and visible only when enabled.
   - Test `getFullGitHubUrl()` handles invalid inputs without throwing.

8. Regression tests:
   - Keep existing tests passing.
   - Add new tests under `tests/` with clear names.
   - Update `package.json` so `npm test` runs all tests.

### Verification

Use `Test_and_Integration.md` as the authoritative acceptance checklist. Update it when adding new automated tests or changing the test procedure.

Run at minimum:

```powershell
npm test
Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }
py -m http.server 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/index.html
```

Verify the checklist in `Test_and_Integration.md`, including:

- App loads without console errors.
- Globe, satellites, menu, and UTC clock render.
- 3D orbit path aligns with the selected satellite.
- Day/night lighting and Sun direction look consistent with UTC time.
- Moon remains visible and behaves according to the documented model.
- Footprint rendering still works in 3D and Mercator views.
- View section collapses all view controls together.
- YPR sliders only show when enabled.
- Filters still update satellite count, markers, and dropdown.
- Existing timeline controls still open, close, and select satellites.

### Deliverable

Report:

1. Files changed.
2. What was fixed for each review finding.
3. The deep tests added and what each one covers.
4. The full `Test_and_Integration.md` checklist items completed.
5. Browser checks performed.
6. Any remaining limitations, especially intentional approximations in orbital mechanics or Moon modeling.

The implementation is not complete until all new deep tests pass, browser smoke testing passes, and the `Test_and_Integration.md` checklist has been followed.

---

## Release Date: 2026-06-02  Version 1.2

Analyze the full `openbexi_earth_orbit` codebase, starting from `index.html`.

Review the application for bugs, regressions, incorrect assumptions, and areas that can be improved. Pay special attention to issues related to the domain of the app, including satellite orbit simulation, orbital mechanics, TLE propagation, ECI/ECEF coordinate transforms, GMST/time handling, Earth rotation, Moon positioning, scaling, units, camera distance, satellite marker/model scale, footprint rendering, Mercator projection, and any mathematical or visual incoherence.

Also review the UI and interaction logic, especially filters, satellite selection, timelines, orbit display, footprint display, day/night rendering, and performance-sensitive animation loops.

For each issue found, report:

1. The file and line number.
2. The severity: critical, major, minor, or improvement.
3. What is wrong or risky.
4. Why it matters for this application.
5. A recommended fix.

If no issue is found in an area, say so clearly. Do not make code changes yet; produce a structured review report first.

---

## Release Date: 2026-06-02  Version 1.1

Update the `openbexi_earth_orbit` app filters and add a regression test plan.

1. Create a Markdown file named `Test_and_Integration.md`.
2. In that file, describe a comprehensive test and regression plan for the application, focused on making sure the app still works after the filter-menu redesign.
3. Replace the current filter design in the menu with a layout similar to the attached reference image:
   - A dark `Filters` section.
   - An `Orbit filter (multi-select)` control using segmented buttons such as `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
   - A `Tag filter (multi-select)` control using compact pill-style toggle chips for satellite tags/operators such as `BeiDou`, `Cosmos`, `Eutelsat`, `Galileo`, `Globalstar`, `GOES`, `Intelsat`, `Iridium`, `NOAA`, `O3b`, `One Web`, `SES`, `Starlink`, `Weather`, and similar existing filter categories.
   - A `Debris filter` control using segmented buttons: `Show`, `Hide`, and `Debris only`.
4. Preserve the existing filtering behavior while updating the UI.
5. After implementing the filter redesign, run through the checks in `Test_and_Integration.md` and confirm that nothing breaks, including:
   - Loading `index.html` through a local HTTP server.
   - Rendering the 3D globe, satellite markers, menu, and clock.
   - Orbit, tag/company, and debris filters updating the satellite count and satellite dropdown correctly.
   - Multi-select filter combinations working correctly.
   - Existing controls such as Globe/Mercator view, Day/Night, satellite selection, orbit display, footprint display, and timelines still working.
6. Report the files changed, the tests performed, and any remaining issues or limitations.
