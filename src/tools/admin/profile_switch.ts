import { allTools } from '../../core/tool.js';
import { isToolVisibleInProfile, PROFILE_LEVELS, configuredProfile, type Profile } from '../../loader.js';
import { result, fail } from '../../core/format.js';

/**
 * pro_fetch_profile_switch — Switch the active tool profile between smart, minimal, standard and full
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * Whether `requested` advertises any tool that `ceiling` does not.
 *
 * The comparison is on the *tool sets*, not on the level numbers. The levels are not a chain:
 * `smart` is 11 meta-tools and `minimal` is 73 tools picked by category, and neither is a subset of
 * the other — measured, 6 tools are only in `smart` and 68 only in `minimal`. Ranking them 0 and 1
 * therefore made `smart → minimal` look like a widening and refused it, while the tool's own message
 * said narrowing was allowed.
 *
 * The set comparison is also the security property the level numbers were standing in for. Measured
 * against it: `standard → full` exposes 494 tools beyond the operator's setting and is refused;
 * `full → smart` exposes none and is allowed; and a profile narrowed to `smart` can widen back to
 * `full` when that is what the operator configured, because the ceiling is captured at start-up rather
 * than read from the mutable environment.
 */
function exceedsCeiling(requested: Profile, ceiling: Profile): boolean {
  if (requested === ceiling) return false;
  return allTools().some((tool) => isToolVisibleInProfile(tool, requested) && !isToolVisibleInProfile(tool, ceiling));
}

export default defineTool({
  name: 'pro_fetch_profile_switch',
  description: 'Switch the active tool profile between smart, minimal, standard and full',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      profile: { type: 'string', description: 'smart | minimal | standard | full' },
    },
    required: ['profile'],
  },
  async handler(input) {
    const p = view(input);
    const prof = String(p.profile ?? 'standard');
    if (!(prof in PROFILE_LEVELS)) return fail('Profil: smart | minimal | standard | full');

    // Widening beyond the operator's configured profile is not allowed. Measured before this: switching
    // to `full` from whatever profile was configured succeeded with `isError: false`, so an operator who
    // deliberately chose `standard` could be overruled by a single tool call.
    //
    // The ceiling is the profile the operator configured at start-up, not the profile currently active.
    // Reading the current one meant that narrowing was a one-way door: an agent that narrowed to
    // `smart` could never widen back, and the only way to restore the operator's setting was to restart
    // the server.
    const ceiling = configuredProfile();
    if (exceedsCeiling(prof as Profile, ceiling)) {
      const active = allTools().filter((tool) => isToolVisibleInProfile(tool, prof as Profile)).length;
      const ceilingCount = allTools().filter((tool) => isToolVisibleInProfile(tool, ceiling)).length;
      return fail(
        `Profil kengaytirilmaydi: operator ${ceiling} profilini tanlagan (${ceilingCount} tool). ` +
          `${prof} (${active} tool) operator chegarasidan tashqariga chiqadi. ` +
          'Toraytirish mumkin, kengaytirish — faqat operator qarori.',
      );
    }

    process.env.PRO_FETCH_PROFILE = prof;
    const active = allTools().filter((tool) => isToolVisibleInProfile(tool, prof as Profile)).length;
    return result('✅ Profil: ' + prof + ' — ' + active + " tool aktiv (keyingi so'rovlardan kuchga kiradi)");
  },
});
