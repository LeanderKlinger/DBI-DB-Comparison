import { PrismaClient } from "@prisma/client";
import { MongoClient, ObjectId } from "mongodb";
import { performance } from "perf_hooks";
import { faker } from "@faker-js/faker";
import type { AggregationResults, Scale, TestResults } from "./types";
import Table from "cli-table3";

interface TestData {
  basic: {
    users: any[];
    posts: any[];
  };
  relational: {
    users: any[];
    posts: any[];
    likes: any[];
  };
}

export class PerformanceTest {
  private prisma: PrismaClient;
  private mongo: MongoClient;
  private dbName = "social_network";

  constructor() {
    this.prisma = new PrismaClient();
    this.mongo = new MongoClient(
      process.env.MONGODB_URL || "mongodb://localhost:27017",
    );
  }

  async connect() {
    await this.mongo.connect();
    await this.setupMongoIndexes();
  }

  async disconnect() {
    await this.prisma.$disconnect();
    await this.mongo.close();
  }

  private async setupMongoIndexes() {
    const db = this.mongo.db(this.dbName);

    // Users collection indexes
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    await db.collection("users").createIndex({ created_at: 1 });

    // Posts collection indexes
    await db.collection("posts").createIndex({ user_id: 1 });
    await db.collection("posts").createIndex({ status: 1 });
    await db.collection("posts").createIndex({ created_at: 1 });
    await db.collection("posts").createIndex({ status: 1, created_at: -1 });

    // Likes collection indexes
    await db.collection("likes").createIndex({ post_id: 1, user_id: 1 }, {
      unique: true,
    });
    await db.collection("likes").createIndex({ post_id: 1 });
    await db.collection("likes").createIndex({ user_id: 1 });
  }

  private async measure(
    name: string,
    fn: () => Promise<void>,
  ): Promise<number> {
    const start = performance.now();
    await fn();
    const end = performance.now();
    return end - start;
  }

  private formatResults(scale: Scale, results: TestResults) {
    const table = new Table({
      head: [
        "Operation",
        "Postgres Basic",
        "Postgres Relations",
        "Mongo Basic",
        "Mongo Relations",
        "Mongo Indexed",
      ],
      style: {
        head: ["cyan"],
        border: ["gray"],
      },
    });

    const operations = Object.keys(results.postgresBasic);
    operations.forEach((op) => {
      table.push([
        op,
        `${(results as any).postgresBasic[op].toFixed(2)}ms`,
        `${(results as any).postgresWithRelations[op].toFixed(2)}ms`,
        `${(results as any).mongoBasic[op].toFixed(2)}ms`,
        `${(results as any).mongoWithRelations[op].toFixed(2)}ms`,
        `${(results as any).mongoWithIndexes[op].toFixed(2)}ms`,
      ]);
    });

    console.log(`\nResults for scale: ${scale}`);
    console.log(table.toString());
  }

  private async generateBasicTestData(
    scale: Scale,
  ): Promise<TestData["basic"]> {
    const usernameSet = new Set<string>();
    while (usernameSet.size < Math.floor(scale / 10)) {
      const username = `${faker.internet.username()}_${faker.string.nanoid(6)}`;
      usernameSet.add(username);
    }

    const users = Array.from(usernameSet).map((username) => ({
      username,
      role: faker.helpers.arrayElement(["user", "moderator"]),
      created_at: faker.date.past(),
    }));

    // Create users first to get their IDs for posts
    await this.prisma.user.createMany({ data: users });
    const dbUsers = await this.prisma.user.findMany();

    const posts = Array.from({ length: scale }, () => ({
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraphs(),
      status: faker.helpers.arrayElement(["active", "draft", "archived"]),
      created_at: faker.date.past(),
      user_id: faker.helpers.arrayElement(dbUsers).id, // Add user_id reference
    }));

    return {
      users: dbUsers,
      posts,
    };
  }

  private async generateRelationalTestData(
    scale: Scale,
  ): Promise<TestData["relational"]> {
    // For Postgres
    const usernameSet = new Set<string>();
    while (usernameSet.size < Math.floor(scale / 10)) {
      const username = `${faker.internet.username()}_${faker.string.nanoid(6)}`;
      usernameSet.add(username);
    }

    const users = Array.from(usernameSet).map((username) => ({
      username,
      role: faker.helpers.arrayElement(["user", "moderator"]),
      created_at: faker.date.past(),
    }));

    // Create users first to get their IDs
    await this.prisma.user.createMany({ data: users });
    const dbUsers = await this.prisma.user.findMany();

    const posts = Array.from({ length: scale }, () => ({
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraphs(),
      status: faker.helpers.arrayElement(["active", "draft", "archived"]),
      created_at: faker.date.past(),
      user_id: faker.helpers.arrayElement(dbUsers).id,
    }));

    // Create posts to get their IDs
    await this.prisma.post.createMany({ data: posts });
    const dbPosts = await this.prisma.post.findMany();

    // Generate likes (about 5 likes per post on average)
    const likes = Array.from({ length: Math.floor(scale * 5) }, () => ({
      post_id: faker.helpers.arrayElement(dbPosts).id,
      user_id: faker.helpers.arrayElement(dbUsers).id,
    }));

    return {
      users: dbUsers,
      posts: dbPosts,
      likes,
    };
  }

  private async generateMongoTestData(scale: Scale): Promise<TestData['relational']> {
    const db = this.mongo.db(this.dbName);
    
    // Generate users
    const usernameSet = new Set<string>();
    while (usernameSet.size < Math.floor(scale / 10)) {
      const username = `${faker.internet.username()}_${faker.string.nanoid(6)}`;
      usernameSet.add(username);
    }
  
    const users = Array.from(usernameSet).map(username => ({
      _id: new ObjectId(),
      username,
      role: faker.helpers.arrayElement(['user', 'moderator']),
      created_at: faker.date.past()
    }));
  
    // Insert users
    await db.collection('users').insertMany(users);
  
    // Generate posts
    const posts = Array.from({ length: scale }, () => ({
      _id: new ObjectId(),
      title: faker.lorem.sentence(),
      body: faker.lorem.paragraphs(),
      status: faker.helpers.arrayElement(['active', 'draft', 'archived']),
      created_at: faker.date.past(),
      user_id: faker.helpers.arrayElement(users)._id
    }));
  
    // Insert posts
    await db.collection('posts').insertMany(posts);
  
    // Generate unique likes (using Set to prevent duplicates)
    const likeSet = new Set<string>();
    const likes: any[] = [];
    
    // Try to generate about 5 likes per post
    while (likes.length < Math.floor(scale * 5)) {
      const post_id = faker.helpers.arrayElement(posts)._id;
      const user_id = faker.helpers.arrayElement(users)._id;
      const likeKey = `${post_id}_${user_id}`;
      
      if (!likeSet.has(likeKey)) {
        likeSet.add(likeKey);
        likes.push({
          _id: new ObjectId(),
          post_id,
          user_id,
          created_at: faker.date.past()
        });
      }
    }
  
    return { users, posts, likes };
  }

  async runTests(scale: Scale): Promise<TestResults> {
    // Clear everything first
    await this.cleanup();

    console.log("Running basic tests...");
    // Run basic tests independently
    const basicData = await this.generateBasicTestData(scale);
    const basicResults = {
      postgresBasic: await this.runPostgresBasicTests(scale, basicData), // FIXED: Was incorrectly using runPostgresRelationsTests
      mongoBasic: await this.runMongoBasicTests(scale, basicData),
    };
    await this.cleanup(); // Clean between test sets

    console.log("Running relational tests...");
    // Run relational tests independently
    const relationalData = await this.generateRelationalTestData(scale);
    const relationalResults = {
      postgresWithRelations: await this.runPostgresRelationsTests(
        scale,
        relationalData,
      ),
      mongoWithRelations: await this.runMongoRelationsTests(
        scale,
        relationalData,
      ),
    };
    await this.cleanup(); // Clean between test sets

    console.log("Running indexed tests...");
    // Run indexed tests independently
    const mongoData = await this.generateMongoTestData(scale);
    const indexedResults = {
      mongoWithIndexes: await this.runMongoIndexedTests(scale, mongoData),
    };

    // Combine all results
    const results: TestResults = {
      postgresBasic: basicResults.postgresBasic,
      postgresWithRelations: relationalResults.postgresWithRelations,
      mongoBasic: basicResults.mongoBasic,
      mongoWithRelations: relationalResults.mongoWithRelations,
      mongoWithIndexes: indexedResults.mongoWithIndexes,
    };

    this.formatResults(scale, results);
    return results;
  }

  private async cleanup() {
    console.log("Cleaning up databases...");
    try {
      // Clean Postgres
      await this.prisma.like.deleteMany({});
      await this.prisma.follows.deleteMany({});
      await this.prisma.post.deleteMany({});
      await this.prisma.user.deleteMany({});

      // Clean MongoDB
      const db = this.mongo.db(this.dbName);
      await db.collection("likes").deleteMany({});
      await db.collection("follows").deleteMany({});
      await db.collection("posts").deleteMany({});
      await db.collection("users").deleteMany({});
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }

  private async runPostgresBasicTests(
    scale: Scale,
    testData: TestData["basic"],
  ): Promise<any> {
    return {
      writes: await this.measure("Postgres Basic Writes", async () => {
        // Users are already created in generateBasicTestData
        await this.prisma.post.createMany({ data: testData.posts });
      }),

      simpleRead: await this.measure("Postgres Basic Read", async () => {
        await this.prisma.post.findMany();
      }),

      filteredRead: await this.measure("Postgres Basic Filtered", async () => {
        await this.prisma.post.findMany({
          where: {
            status: "active",
          },
        });
      }),

      projectedRead: await this.measure(
        "Postgres Basic Projected",
        async () => {
          await this.prisma.post.findMany({
            select: {
              title: true,
              created_at: true,
            },
          });
        },
      ),

      sortedRead: await this.measure("Postgres Basic Sorted", async () => {
        await this.prisma.post.findMany({
          orderBy: {
            created_at: "desc",
          },
        });
      }),

      update: await this.measure("Postgres Basic Update", async () => {
        await this.prisma.post.updateMany({
          where: {
            status: "active",
          },
          data: {
            status: "archived",
          },
        });
      }),

      delete: await this.measure("Postgres Basic Delete", async () => {
        await this.prisma.post.deleteMany({
          where: {
            status: "archived",
          },
        });
      }),
    };
  }

  private async runPostgresRelationsTests(scale: Scale, testData: TestData['relational']): Promise<any> {
    return {
      writes: await this.measure("Postgres Relations Writes", async () => {
        // Remove IDs from posts and likes before inserting
        const postsWithoutIds = testData.posts.map(post => ({
          title: post.title,
          body: post.body,
          status: post.status,
          created_at: post.created_at,
          user_id: post.user_id
        }));
  
        const posts = await this.prisma.post.createMany({
          data: postsWithoutIds
        });
  
        const likesWithoutIds = testData.likes.map(like => ({
          post_id: like.post_id,
          user_id: like.user_id
        }));
  
        await this.prisma.like.createMany({
          data: likesWithoutIds,
          skipDuplicates: true,
        });
      }),
  
      // Rest of the tests remain the same
      simpleRead: await this.measure("Postgres Relations Read", async () => {
        await this.prisma.post.findMany({
          include: {
            user: true,
            likes: true,
          },
        });
      }),

      filteredRead: await this.measure(
        "Postgres Relations Filtered",
        async () => {
          await this.prisma.post.findMany({
            where: {
              status: "active",
              likes: { some: {} },
            },
            include: {
              user: true,
              likes: true,
            },
          });
        },
      ),

      projectedRead: await this.measure(
        "Postgres Relations Projected",
        async () => {
          await this.prisma.post.findMany({
            where: { status: "active" },
            select: {
              title: true,
              created_at: true,
              user: {
                select: { username: true },
              },
              _count: { select: { likes: true } },
            },
          });
        },
      ),

      sortedRead: await this.measure("Postgres Relations Sorted", async () => {
        await this.prisma.post.findMany({
          where: { status: "active" },
          select: {
            title: true,
            created_at: true,
            user: {
              select: { username: true },
            },
            _count: { select: { likes: true } },
          },
          orderBy: [
            { created_at: "desc" },
            { title: "asc" },
          ],
        });
      }),

      update: await this.measure("Postgres Relations Update", async () => {
        const posts = await this.prisma.post.findMany({
          where: { likes: { some: {} } },
          select: { id: true },
        });

        await this.prisma.post.updateMany({
          where: { id: { in: posts.map((p) => p.id) } },
          data: { status: "trending" },
        });
      }),

      delete: await this.measure("Postgres Relations Delete", async () => {
        // Delete posts with no likes
        await this.prisma.post.deleteMany({
          where: {
            likes: { none: {} },
          },
        });
      }),
    };
  }

  private async runMongoBasicTests(scale: Scale, testData: any): Promise<any> {
    const db = this.mongo.db(this.dbName);

    return {
      writes: await this.measure("Mongo Basic Writes", async () => {
        // Let MongoDB handle the _id generation
        const users = testData.users.map((user: any) => ({
          username: user.username,
          role: user.role,
          created_at: user.created_at,
        }));
        await db.collection("users").insertMany(users);

        const userDocs = await db.collection("users").find().toArray();
        const posts = testData.posts.map((post: any) => ({
          title: post.title,
          body: post.body,
          status: post.status,
          created_at: post.created_at,
          user_id: faker.helpers.arrayElement(userDocs)._id, // Reference a valid MongoDB user
        }));
        await db.collection("posts").insertMany(posts);
      }),

      simpleRead: await this.measure("Mongo Basic Read", async () => {
        await db.collection("posts").find().toArray();
      }),

      filteredRead: await this.measure("Mongo Basic Filtered", async () => {
        await db.collection("posts").find({
          status: "active",
        }).toArray();
      }),

      projectedRead: await this.measure("Mongo Basic Projected", async () => {
        await db.collection("posts").find({}, {
          projection: { title: 1, created_at: 1 },
        }).toArray();
      }),

      sortedRead: await this.measure("Mongo Basic Sorted", async () => {
        await db.collection("posts")
          .find()
          .sort({ created_at: -1 })
          .toArray();
      }),

      update: await this.measure("Mongo Basic Update", async () => {
        await db.collection("posts").updateMany(
          { status: "active" },
          { $set: { status: "archived" } },
        );
      }),

      delete: await this.measure("Mongo Basic Delete", async () => {
        await db.collection("posts").deleteMany({
          status: "archived",
        });
      }),
    };
  }

  private async runMongoRelationsTests(scale: Scale, testData: TestData['relational']): Promise<any> {
    const db = this.mongo.db(this.dbName);
  
    return {
      writes: await this.measure("Mongo Relations Writes", async () => {
        await db.collection("users").insertMany(testData.users);
        await db.collection("posts").insertMany(testData.posts);
        
        // Insert likes with ordered: false to continue on error
        try {
          await db.collection("likes").insertMany(testData.likes, { ordered: false });
        } catch (error) {
          console.log('Some duplicate likes were skipped');
        }
      }),

      simpleRead: await this.measure("Mongo Relations Read", async () => {
        await db.collection("posts").aggregate([
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          { $unwind: "$user" },
        ]).toArray();
      }),

      filteredRead: await this.measure("Mongo Relations Filtered", async () => {
        await db.collection("posts").aggregate([
          {
            $match: { status: "active" },
          },
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          {
            $match: { "likes.0": { $exists: true } },
          },
          { $unwind: "$user" },
        ]).toArray();
      }),

      projectedRead: await this.measure(
        "Mongo Relations Projected",
        async () => {
          await db.collection("posts").aggregate([
            {
              $match: { status: "active" },
            },
            {
              $lookup: {
                from: "users",
                localField: "user_id",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "post_id",
                as: "likes",
              },
            },
            { $unwind: "$user" },
            {
              $project: {
                title: 1,
                created_at: 1,
                "user.username": 1,
                likeCount: { $size: "$likes" },
              },
            },
          ]).toArray();
        },
      ),

      sortedRead: await this.measure("Mongo Relations Sorted", async () => {
        await db.collection("posts").aggregate([
          {
            $match: { status: "active" },
          },
          {
            $lookup: {
              from: "users",
              localField: "user_id",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          { $unwind: "$user" },
          {
            $project: {
              title: 1,
              created_at: 1,
              "user.username": 1,
              likeCount: { $size: "$likes" },
            },
          },
          {
            $sort: { created_at: -1, title: 1 },
          },
        ]).toArray();
      }),

      update: await this.measure("Mongo Relations Update", async () => {
        const postsWithLikes = await db.collection("posts").aggregate([
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          {
            $match: { "likes.0": { $exists: true } },
          },
        ]).toArray();

        await db.collection("posts").updateMany(
          { _id: { $in: postsWithLikes.map((p) => p._id) } },
          { $set: { status: "trending" } },
        );
      }),

      delete: await this.measure("Mongo Relations Delete", async () => {
        const postsWithoutLikes = await db.collection("posts").aggregate([
          {
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          {
            $match: { "likes.0": { $exists: false } },
          },
        ]).toArray();

        await db.collection("posts").deleteMany({
          _id: { $in: postsWithoutLikes.map((p) => p._id) },
        });
      }),
    };
  }

  private async runMongoIndexedTests(scale: Scale, testData: TestData['relational']): Promise<any> {
    const db = this.mongo.db(this.dbName);
    
    return {
      writes: await this.measure("Mongo Indexed Writes", async () => {
        // Bulk operations remain the same
        const userOps = db.collection("users").initializeUnorderedBulkOp();
        testData.users.forEach(user => {
          userOps.insert(user);
        });
        
        const postOps = db.collection("posts").initializeUnorderedBulkOp();
        testData.posts.forEach(post => {
          postOps.insert(post);
        });
        
        const likeOps = db.collection("likes").initializeUnorderedBulkOp();
        testData.likes.forEach(like => {
          likeOps.insert(like);
        });
  
        try {
          await Promise.all([
            userOps.execute(),
            postOps.execute(),
            likeOps.execute()
          ]);
        } catch (error) {
          console.log('Some documents were skipped due to duplicates');
        }
      }),
  
      simpleRead: await this.measure("Mongo Indexed Read", async () => {
        // Use basic index
        await db.collection("posts")
          .find()
          .toArray();
      }),
  
      filteredRead: await this.measure("Mongo Indexed Filtered", async () => {
        // Use single field index only
        await db.collection("posts")
          .find({ status: "active" })
          .hint({ status: 1 })
          .toArray();
      }),
  
      projectedRead: await this.measure("Mongo Indexed Projected", async () => {
        // Use compound index on status and created_at
        await db.collection("posts")
          .find(
            { status: "active" },
            { projection: { title: 1, created_at: 1 } }
          )
          .hint({ "status": 1, "created_at": -1 })  // Match exactly with setupMongoIndexes
          .toArray();
      }),
  
      sortedRead: await this.measure("Mongo Indexed Sorted", async () => {
        await db.collection("posts")
          .find()
          .sort({ created_at: -1 })
          .hint({ "created_at": 1 })  // Match exactly with setupMongoIndexes
          .toArray();
      }),
  
      update: await this.measure("Mongo Indexed Update", async () => {
        await db.collection("posts").updateMany(
          { status: "active" },
          { $set: { status: "archived" } }
        );  // Remove hint for update as it's not needed
      }),
  
      delete: await this.measure("Mongo Indexed Delete", async () => {
        await db.collection("posts").deleteMany(
          { status: "archived" }
        );  // Remove hint for delete as it's not needed
      })
    };
  }

  async runAggregationTests(): Promise<AggregationResults> {
    const db = this.mongo.db(this.dbName);

    const results: AggregationResults = {
      postgres: {
        postsPerUser: await this.measure(
          "Postgres Posts per User",
          async () => {
            await this.prisma.user.findMany({
              select: {
                username: true,
                _count: {
                  select: { posts: true },
                },
              },
              orderBy: {
                posts: { _count: "desc" },
              },
            });
          },
        ),

        avgLikesPerPost: await this.measure(
          "Postgres Avg Likes per Post",
          async () => {
            await this.prisma.$queryRaw`
            SELECT AVG(like_count) 
            FROM (
              SELECT COUNT(l.post_id) as like_count 
              FROM "Post" p 
              LEFT JOIN "Like" l ON p.id = l.post_id 
              GROUP BY p.id
            ) counts
          `;
          },
        ),

        mostActiveUsers: await this.measure(
          "Postgres Most Active Users",
          async () => {
            await this.prisma.user.findMany({
              select: {
                username: true,
                posts: {
                  select: {
                    _count: {
                      select: { likes: true },
                    },
                  },
                },
                _count: {
                  select: { posts: true },
                },
              },
              orderBy: {
                posts: { _count: "desc" },
              },
              take: 10,
            });
          },
        ),

        mostLikedPosts: await this.measure(
          "Postgres Most Liked Posts",
          async () => {
            await this.prisma.post.findMany({
              select: {
                title: true,
                user: {
                  select: { username: true },
                },
                _count: {
                  select: { likes: true },
                },
              },
              orderBy: {
                likes: { _count: "desc" },
              },
              take: 10,
            });
          },
        ),

        userEngagement: await this.measure(
          "Postgres User Engagement",
          async () => {
            await this.prisma.$queryRaw`
            SELECT 
              u.username,
              COUNT(DISTINCT p.id) as post_count,
              COUNT(DISTINCT l.post_id) as likes_given,
              COUNT(DISTINCT pl.user_id) as likes_received
            FROM "User" u
            LEFT JOIN "Post" p ON u.id = p.user_id
            LEFT JOIN "Like" l ON u.id = l.user_id
            LEFT JOIN "Like" pl ON p.id = pl.post_id
            GROUP BY u.id, u.username
            ORDER BY (
              COUNT(DISTINCT p.id) + 
              COUNT(DISTINCT l.post_id) + 
              COUNT(DISTINCT pl.user_id)
            ) DESC
            LIMIT 10
          `;
          },
        ),
      },

      mongo: {
        postsPerUser: await this.measure("Mongo Posts per User", async () => {
          await db.collection("users").aggregate([
            {
              $lookup: {
                from: "posts",
                localField: "_id",
                foreignField: "user_id",
                as: "posts",
              },
            },
            {
              $project: {
                username: 1,
                postCount: { $size: "$posts" },
              },
            },
            { $sort: { postCount: -1 } },
          ]).toArray();
        }),

        avgLikesPerPost: await this.measure(
          "Mongo Avg Likes per Post",
          async () => {
            await db.collection("posts").aggregate([
              {
                $lookup: {
                  from: "likes",
                  localField: "_id",
                  foreignField: "post_id",
                  as: "likes",
                },
              },
              {
                $group: {
                  _id: null,
                  avgLikes: { $avg: { $size: "$likes" } },
                },
              },
            ]).toArray();
          },
        ),

        mostActiveUsers: await this.measure(
          "Mongo Most Active Users",
          async () => {
            await db.collection("users").aggregate([
              {
                $lookup: {
                  from: "posts",
                  localField: "_id",
                  foreignField: "user_id",
                  as: "posts",
                },
              },
              {
                $lookup: {
                  from: "likes",
                  localField: "posts._id",
                  foreignField: "post_id",
                  as: "receivedLikes",
                },
              },
              {
                $project: {
                  username: 1,
                  postCount: { $size: "$posts" },
                  totalLikes: { $size: "$receivedLikes" },
                },
              },
              { $sort: { postCount: -1, totalLikes: -1 } },
              { $limit: 10 },
            ]).toArray();
          },
        ),

        mostLikedPosts: await this.measure(
          "Mongo Most Liked Posts",
          async () => {
            await db.collection("posts").aggregate([
              {
                $lookup: {
                  from: "likes",
                  localField: "_id",
                  foreignField: "post_id",
                  as: "likes",
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "user_id",
                  foreignField: "_id",
                  as: "user",
                },
              },
              {
                $project: {
                  title: 1,
                  "user.username": 1,
                  likeCount: { $size: "$likes" },
                },
              },
              { $sort: { likeCount: -1 } },
              { $limit: 10 },
            ]).toArray();
          },
        ),

        userEngagement: await this.measure(
          "Mongo User Engagement",
          async () => {
            await db.collection("users").aggregate([
              // Posts created
              {
                $lookup: {
                  from: "posts",
                  localField: "_id",
                  foreignField: "user_id",
                  as: "posts",
                },
              },
              // Likes given
              {
                $lookup: {
                  from: "likes",
                  localField: "_id",
                  foreignField: "user_id",
                  as: "likesGiven",
                },
              },
              // Likes received on posts
              {
                $lookup: {
                  from: "likes",
                  localField: "posts._id",
                  foreignField: "post_id",
                  as: "likesReceived",
                },
              },
              {
                $project: {
                  username: 1,
                  postCount: { $size: "$posts" },
                  likesGiven: { $size: "$likesGiven" },
                  likesReceived: { $size: "$likesReceived" },
                  engagementScore: {
                    $add: [
                      { $size: "$posts" },
                      { $size: "$likesGiven" },
                      { $size: "$likesReceived" },
                    ],
                  },
                },
              },
              { $sort: { engagementScore: -1 } },
              { $limit: 10 },
            ]).toArray();
          },
        ),
      },
    };

    return results;
  }
}
