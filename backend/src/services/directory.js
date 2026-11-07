import { z } from "zod";
import { Employee } from "../models/index.js";
import { parse, escapeRegex } from "../common/validate.js";
import { cardUrl, fullName } from "./cards.js";

const querySchema = z.object({
  search: z.string().trim().max(80).optional(),
  department: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function directoryPage(org, input) {
  const query = parse(querySchema, input);
  const filter = {
    organizationId: org._id,
    cardStatus: "active",
    isPublished: true,
    hideFromDirectory: { $ne: true },
  };
  if (query.department) filter.department = query.department;
  const terms = (query.search || "").split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const rx = { $regex: escapeRegex(term), $options: "i" };
      return { $or: [{ firstName: rx }, { lastName: rx }, { designation: rx }, { department: rx }] };
    });
  }

  const page = query.page || 1;
  const limit = Math.min(query.limit || 25, 50);
  const [total, employees, departments] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.find(filter).select("firstName lastName designation department photoUrl slug").sort({ firstName: 1, lastName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.distinct("department", {
      organizationId: org._id,
      cardStatus: "active",
      isPublished: true,
      hideFromDirectory: { $ne: true },
      department: { $nin: ["", null] },
    }),
  ]);
  return {
    data: employees.map((employee) => ({
      name: fullName(employee),
      designation: employee.designation,
      department: employee.department,
      photo: employee.photoUrl,
      cardUrl: cardUrl(org.slug, employee.slug),
    })),
    pagination: { page, limit, total },
    meta: { departments: departments.sort((a, b) => a.localeCompare(b)) },
  };
}
