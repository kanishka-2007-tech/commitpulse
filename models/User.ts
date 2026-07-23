import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUserGoals {
  monthly: number;
  yearly: number;
}

export interface IUser extends Document {
  username: string;
  githubToken?: string;
  createdAt: Date;
  lastSeen?: Date;
  visitCount: number;
  goals?: IUserGoals;
}

const UserSchema: Schema<IUser> = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  githubToken: {
    type: String,
    // Note: The actual encryption/decryption happens at the service layer
    // or via mongoose pre-save hooks. For now, we store the encrypted string here.
    select: false, // Ensure tokens aren't accidentally exposed in general queries
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastSeen: {
    type: Date,
  },
  visitCount: {
    type: Number,
    default: 0,
  },
  goals: {
    monthly: { type: Number, min: 1 },
    yearly: { type: Number, min: 1 },
  },
});

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
