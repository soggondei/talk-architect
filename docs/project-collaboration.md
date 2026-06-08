# Project Collaboration Notes

## Purpose

Talk Architect is a competition-design support tool. It should convert design briefs into reliable room data, adjacency requirements, layout tests, and export-ready project settings before schematic design.

The system should not behave as a simple layout demo. Its main value is preserving brief requirements, letting the designer confirm them, and testing whether a layout satisfies them.

## Shared Working Rules

- One coding agent should edit the project at a time.
- Check the current worktree before changing shared files.
- Update `docs/data-schema.md` whenever the core data model changes.
- Keep AI-suggested values separate from user-confirmed values.
- Preserve source evidence from the design brief whenever possible.
- Avoid duplicate implementations of the same export, validation, or parsing feature.
- Use stable IDs for rooms, relations, guideline items, and layout items.

## Codex Focus

- Existing code structure
- Data schema
- Validation logic
- UI state consistency
- Tests and regressions
- Safe incremental implementation

## Claude Code Focus

- Brief interpretation
- UX flow proposals
- Report wording
- Guideline extraction prompt design
- Design-practice feature suggestions

## Current Priority

1. Stabilize room and relation data.
2. Detect area and room-count mismatches.
3. Add evidence to adjacency relationships.
4. Explain layout satisfaction and unresolved issues.
5. Prepare export data for DWG/Revit/Rhino workflows.

## Handoff Template

```md
## Work Log

Worker: Codex or Claude Code

### Changed

-

### Main Files

-

### Schema Changed

Yes/No

### Notes For Next Worker

-

### Remaining Issues

-
```
