---
Feature: Task triage — confirm/reject scan proposals before DB
Date: 2026-04-13
Tier: LOW (override from HIGH, score 12)
Status: SIGNED OFF
Target release: v0.1.4
App version at last update: v0.1.3
---

# Task triage

## Goal

Scanned emails classified as "actionable" should not auto-create tasks. Instead, they appear as proposals on the scan results page. The user confirms (promotes to task with inline quick-edit) or rejects (trains the classifier, never enters tasks DB). Unreviewed proposals persist and are filterable.

## Acceptance criteria

- AC-001 [MUST] — **Given** a scan completes with actionable emails, **When** results are shown, **Then** no tasks are auto-created in the DB — actionable emails stay in `emailsScanned` with `triageStatus = 'unreviewed'`.
- AC-002 [MUST] — **Given** scan results are displayed, **When** the user views the page, **Then** each actionable email is shown as a triage card with title (subject), sender, date, AI summary, and thumbs-up / thumbs-down buttons.
- AC-003 [MUST] — **Given** the user clicks thumbs-up on a triage card, **When** the inline edit form expands, **Then** title, priority, assignee, and topic are pre-filled from AI suggestions and editable before saving.
- AC-004 [MUST] — **Given** the user saves the inline edit form, **When** the task is created, **Then** a task row is inserted in the DB linked to the `emailsScanned` row, and `triageStatus` is set to `'confirmed'`.
- AC-005 [MUST] — **Given** the user clicks thumbs-down, **When** the rejection is processed, **Then** `triageStatus` is set to `'rejected'`, feedback is recorded in `aiFeedback`, and a learned rule is appended to classification config.
- AC-006 [MUST] — **Given** the scan results page loads, **When** there are past unreviewed/confirmed/rejected items, **Then** the user can filter by triage status (unreviewed / confirmed / rejected / all).
- AC-007 [SHOULD] — **Given** the home page scan card, **When** there are unreviewed proposals, **Then** a badge shows the unreviewed count.
