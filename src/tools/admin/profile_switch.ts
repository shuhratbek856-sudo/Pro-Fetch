import { allTools } from '../../core/tool.js';
import { isToolVisibleInProfile, PROFILE_LEVELS, profileCeiling, type Profile } from '../../loader.js';
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
 * made `smart → minimal` look like a widening and refused it, while the tool's own message said
 * narrowing was allowed.
 *
 * Only consulted when the operator has pinned a ceiling with `PRO_FETCH_PROFILE_CEILING`. With no
 * ceiling set, every switch is allowed: the operator asking for `full` is the decision, and the model
 * calling this tool is carrying it out.
 */
function exceedsCeiling(requested: Profile, ceiling: Profile): boolean {
  if (requested === ceiling) return false;
  return allTools().some((tool) => isToolVisibleInProfile(tool, requested) && !isToolVisibleInProfile(tool, ceiling));
}

export default defineTool({
  name: 'pro_fetch_profile_switch',
  description:
    'Switch the active tool profile between smart, minimal, standard and full. ' +
    'The operator’s instruction governs: asking for `full` switches to `full`. ' +
    'Set PRO_FETCH_PROFILE_CEILING to pin a maximum the switch may not pass.',
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

    // The operator's instruction governs. When the model calls this tool because someone asked for
    // `full` mode, refusing it because the process was started in `standard` would mean the operator
    // cannot widen the surface they are working with.
    //
    // A ceiling is still available for operators who want one: `PRO_FETCH_PROFILE_CEILING=standard`
    // pins the maximum and then widening past it is refused, with the pinned profile named in the
    // message. Without it, every switch is allowed.
    const ceiling = profileCeiling();
    if (ceiling && exceedsCeiling(prof as Profile, ceiling)) {
      const active = allTools().filter((tool) => isToolVisibleInProfile(tool, prof as Profile)).length;
      const ceilingCount = allTools().filter((tool) => isToolVisibleInProfile(tool, ceiling)).length;
      return fail(
        `Profil kengaytirilmaydi: operator ${ceiling} chegarasini qo‘ygan (${ceilingCount} tool). ` +
          `${prof} (${active} tool) shu chegaradan tashqariga chiqadi. ` +
          'Chegarani olib tashish uchun PRO_FETCH_PROFILE_CEILING ni o‘zgartiring.',
      );
    }

    process.env.PRO_FETCH_PROFILE = prof;
    const active = allTools().filter((tool) => isToolVisibleInProfile(tool, prof as Profile)).length;
    const suffix = ceiling ? ` (chegara: ${ceiling})` : '';
    return result('✅ Profil: ' + prof + ' — ' + active + " tool aktiv (keyingi so'rovlardan kuchga kiradi)" + suffix);
  },
});
