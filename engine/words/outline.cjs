'use strict';

const MAX_GAP = 90;
const MIN_CHAPTERS = 3; // YouTube needs at least three chapters in the description

/** Structure and retention checks for outline.json against the brief's length target. */
function outlineIssues(outline, brief) {
  const issues = [];
  const chapters = outline.chapters || [];
  if (chapters.length < MIN_CHAPTERS) {
    issues.push(`Outline has ${chapters.length} chapters; at least ${MIN_CHAPTERS} are needed.`);
  }
  for (const c of chapters) {
    if (!c.title || !c.purpose) issues.push(`Chapter ${c.id} needs a title and a purpose.`);
    if (!(c.targetSeconds > 0)) issues.push(`Chapter ${c.id} needs targetSeconds.`);
  }

  const total = chapters.reduce((sum, c) => sum + (c.targetSeconds || 0), 0);
  const target = (brief.lengthTargetMin || 0) * 60;
  if (target && Math.abs(total - target) > target * 0.1) {
    issues.push(`Chapters total ${total} s; the target is ${target} s (±10%).`);
  }

  const hookEnd = outline.hook && outline.hook.endsAt;
  if (!(hookEnd > 0 && hookEnd <= 30)) issues.push('The hook must end by 30 s (hook.endsAt).');

  // Re-hooks must keep coming every ≤ 90 s from the end of the hook until the final minute.
  const points = [hookEnd || 30, ...(outline.rehooks || []).map((r) => r.atSeconds)];
  if (total - 60 > points[points.length - 1]) points.push(total - 60);
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i] - points[i - 1];
    if (gap < 0) issues.push('Re-hooks must be in time order.');
    else if (gap > MAX_GAP) {
      issues.push(
        `Re-hook gap of ${gap} s between ${points[i - 1]} s and ${points[i]} s (max ${MAX_GAP} s).`,
      );
    }
  }
  for (const r of outline.rehooks || []) {
    if (!r.line) issues.push(`The re-hook at ${r.atSeconds} s needs its line.`);
  }
  if (!outline.payoff) issues.push('The outline needs a payoff (what the viewer finally learns).');
  return issues;
}

module.exports = { outlineIssues };
