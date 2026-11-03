/**
 * Tenant guard — a Mongoose plugin that refuses any query on a tenant-owned
 * collection unless the filter contains `organizationId`.
 *
 * This is the database-level safety net behind route-level checks: even if a
 * developer forgets to scope a query, it fails loudly instead of leaking
 * another company's data.
 *
 * Platform (Super Admin) code that must read across tenants opts out explicitly:
 *   Model.find({}).setOptions({ skipTenantGuard: true })
 *   Model.aggregate([...]).option({ skipTenantGuard: true })
 */
const QUERY_OPS = [
  "find",
  "findOne",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "replaceOne",
  "distinct",
];

export class TenantGuardError extends Error {
  constructor(model, op) {
    super(`Tenant guard blocked ${model}.${op}() without organizationId in the filter`);
    this.statusCode = 500;
    this.code = "TENANT_GUARD";
  }
}

export function tenantGuard(schema) {
  for (const op of QUERY_OPS) {
    schema.pre(op, function () {
      const opts = this.getOptions();
      if (opts.skipTenantGuard) {
        delete opts.skipTenantGuard;
        return;
      }
      const filter = this.getFilter() || {};
      if (filter.organizationId === undefined || filter.organizationId === null) {
        throw new TenantGuardError(this.model.modelName, op);
      }
    });
  }

  schema.pre("aggregate", function () {
    if (this.options && this.options.skipTenantGuard) {
      delete this.options.skipTenantGuard;
      return;
    }
    const first = this.pipeline()[0];
    if (!first || !first.$match || first.$match.organizationId == null) {
      throw new TenantGuardError(this._model?.modelName || "Model", "aggregate");
    }
  });

  schema.pre("insertMany", function (docs) {
    const list = Array.isArray(docs) ? docs : [docs];
    for (const d of list) {
      if (!d || d.organizationId == null) throw new TenantGuardError(this.modelName, "insertMany");
    }
  });

  schema.pre("bulkWrite", function (ops) {
    for (const op of ops || []) {
      const body = op.updateOne || op.updateMany || op.deleteOne || op.deleteMany || op.replaceOne;
      if (body && (!body.filter || body.filter.organizationId == null)) {
        throw new TenantGuardError(this.modelName, "bulkWrite");
      }
      if (op.insertOne && op.insertOne.document?.organizationId == null) {
        throw new TenantGuardError(this.modelName, "bulkWrite");
      }
    }
  });
}
