import mongoose from "mongoose";

const { Schema, model } = mongoose;

const testimonialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, trim: true, maxlength: 80, default: "" },
    company: { type: String, required: true, trim: true, maxlength: 100 },
    quote: { type: String, required: true, trim: true, minlength: 20, maxlength: 500 },
    rating: { type: Number, min: 1, max: 5, default: null },
    consentConfirmed: { type: Boolean, required: true },
    isPublished: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

testimonialSchema.index({ isPublished: 1, sortOrder: 1 });
export const Testimonial = model("Testimonial", testimonialSchema);
