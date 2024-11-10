// MongoDB schemas and types 
export type MongoUser = {
    _id: string;
    username: string;
    role: string;
    created_at: Date;
}
  
export type MongoPost = {
    _id: string;
    title: string;
    body: string;
    status: string;
    created_at: Date;
    user_id: string;
    user?: MongoUser;  // For populated queries
    like_count?: number; // Denormalized for performance
}
  
export type MongoLike = {
    _id: string;
    post_id: string;
    user_id: string;
}
  
export type MongoFollows = {
    _id: string;
    following_user_id: string;
    followed_user_id: string;
    created_at: Date;
}