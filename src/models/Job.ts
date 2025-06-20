import JobType from "@/types/job";
import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    bidPlaced: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<Document & JobType>("Job", JobSchema);
