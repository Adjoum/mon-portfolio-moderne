// === models/Reaction.ts ===
import mongoose, {Document, Schema} from "mongoose";


const ReactionSchema = new Schema({
  targetId:   { type: Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ['article', 'comment'], required: true },
  userId:     { type: Schema.Types.ObjectId, ref: 'User' },
  sessionId:  { type: String, required: true },   // fingerprint visiteur
  emoji:      { type: String, required: true },
}, { timestamps: true });

// Un visiteur ne peut réagir qu'une fois par cible
ReactionSchema.index(
  { targetId: 1, targetType: 1, sessionId: 1, emoji: 1 },
  { unique: true }
);

export const Reaction = mongoose.model('Reaction', ReactionSchema);
