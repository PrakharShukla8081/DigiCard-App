/**
 * groupSum — run `$group` with several `$sum` accumulators.
 *
 * On MongoDB this is a single aggregation. Some MongoDB-compatible engines
 * (e.g. FerretDB 1.x, used for local testing) only evaluate the first
 * accumulator correctly; set AGG_SINGLE_ACCUMULATOR=1 for those and the same
 * result is produced with one pipeline per field.
 *
 * @param Model     mongoose model
 * @param prefix    pipeline stages before the $group (must start with $match for tenant models)
 * @param id        the $group _id expression
 * @param fields    { outputName: "$path.to.number" | 1 }
 * @param options   aggregate options, e.g. { skipTenantGuard: true }
 * @param sort      optional $sort stage applied after grouping (on MongoDB)
 */
export async function groupSum(Model, prefix, id, fields, options = null, sort = null) {
  const acc = Object.fromEntries(Object.entries(fields).map(([k, expr]) => [k, { $sum: expr }]));
  const run = (pipeline) => {
    const q = Model.aggregate(pipeline);
    if (options) q.option({ ...options });
    return q;
  };
  if (!process.env.AGG_SINGLE_ACCUMULATOR) {
    return run([...prefix, { $group: { _id: id, ...acc } }, ...(sort ? [{ $sort: sort }] : [])]);
  }
  const out = new Map();
  for (const [k, a] of Object.entries(acc)) {
    const rows = await run([...prefix, { $group: { _id: id, [k]: a } }]);
    for (const r of rows) {
      const key = JSON.stringify(r._id);
      const cur = out.get(key) || { _id: r._id };
      cur[k] = r[k];
      out.set(key, cur);
    }
  }
  const list = [...out.values()];
  for (const r of list) for (const k of Object.keys(fields)) r[k] ??= 0;
  if (sort) {
    const [[sk, dir]] = Object.entries(sort);
    list.sort((a, b) => (a[sk] > b[sk] ? dir : a[sk] < b[sk] ? -dir : 0));
  }
  return list;
}
