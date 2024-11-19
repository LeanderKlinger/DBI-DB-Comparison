import { PrismaClient } from "@prisma/client";
import { MongoClient, ObjectId } from "mongodb";
import { performance } from "perf_hooks";
import { faker } from "@faker-js/faker";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export class PerformanceTest {
  private prisma: PrismaClient;
  private mongo: MongoClient;
  private mongoCloud: MongoClient;
  private dbName = "social_network";

  constructor() {
    this.prisma = new PrismaClient();
    this.mongo = new MongoClient(process.env.MONGODB_URL || "mongodb://localhost:27017");
	this.mongoCloud = new MongoClient(process.env.MONGODB_CLOUD_URL)
  }

  async connect() {
    await this.mongo.connect();
  }

  async disconnect() {
    await this.prisma.$disconnect();
    await this.mongo.close();
	await this.mongoCloud.close();
  }

  private async measure(name: string, fn: () => Promise<void>) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    return end - start;
  }

  private async cleanup() {
    await this.prisma.like.deleteMany({});
    await this.prisma.follows.deleteMany({});
    await this.prisma.post.deleteMany({});
    await this.prisma.user.deleteMany({});

    const db = this.mongo.db(this.dbName);
    await db.collection("likes").deleteMany({});
    await db.collection("follows").deleteMany({});
    await db.collection("posts").deleteMany({});
    await db.collection("users").deleteMany({});
  }

  private generateFakeData(scale: number) {
    // Generate unique usernames using a Set
    const usernameSet = new Set<string>();

    while (usernameSet.size < Math.floor(scale / 10)) {
      // Ensure uniqueness by adding a random suffix
      const username = `${faker.internet.username()}_${faker.string.nanoid(6)}`;
      usernameSet.add(username);
    }

    const users = Array.from(usernameSet).map((username) => ({
      username,
      role: faker.helpers.arrayElement(["user", "moderator"]),
    }));

    const generatePosts = (dbUsers: any[]) =>
      Array.from({ length: scale }, () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraphs(),
        status: faker.helpers.arrayElement(["active", "draft", "archived"]),
        user_id: faker.helpers.arrayElement(dbUsers).id,
      }));

    return { users, generatePosts };
  }

  async runTests(scale: 100 | 1000 | 30000) {
    await this.cleanup();

    const results = {
      postgres: {
        writes: 0,
        simpleRead: 0,
        filteredRead: 0,
        projectedRead: 0,
        sortedRead: 0,
        update: 0,
        delete: 0,
      },
      mongo: {
        writes: 0,
        simpleRead: 0,
        filteredRead: 0,
        projectedRead: 0,
        sortedRead: 0,
        update: 0,
        delete: 0,
      },
	  atlas: {
        writes: 0,
        simpleRead: 0,
        filteredRead: 0,
        projectedRead: 0,
        sortedRead: 0,
        update: 0,
        delete: 0,
      }
    };

    const { users, generatePosts } = this.generateFakeData(scale);

    console.log("------------------------");
    console.log("Postgres");
    console.log("------------------------");
    // Postgres Tests
    results.postgres.writes = await this.measure("Writes", async () => {
      await this.prisma.user.createMany({ data: users });
      const dbUsers = await this.prisma.user.findMany();
      const posts = generatePosts(dbUsers);
      await this.prisma.post.createMany({ data: posts });

      // Generate some likes
      const allPosts = await this.prisma.post.findMany({
        select: { id: true },
      });
      const likes = Array.from({ length: Math.floor(scale / 2) }, () => ({
        post_id: faker.helpers.arrayElement(allPosts).id,
        user_id: faker.helpers.arrayElement(dbUsers).id,
      }));

      try {
        await this.prisma.like.createMany({
          data: likes,
          skipDuplicates: true, // Skip duplicate user-post combinations
        });
      } catch (error) {
        console.log("Some likes were skipped due to duplicates");
      }
    });

    results.postgres.simpleRead = await this.measure(
      "Simple Read",
      async () => {
        await this.prisma.post.findMany({
          include: {
            user: true,
            likes: true,
          },
        });
      },
    );

    results.postgres.filteredRead = await this.measure(
      "Filtered Read",
      async () => {
        await this.prisma.post.findMany({
          where: {
            status: "active",
            likes: { some: {} }, // Posts with at least one like
          },
          include: {
            user: true,
            likes: true,
          },
        });
      },
    );

    results.postgres.projectedRead = await this.measure(
      "Projected Read",
      async () => {
        await this.prisma.post.findMany({
          where: { status: "active" },
          select: {
            title: true,
            created_at: true,
            user: {
              select: {
                username: true,
              },
            },
            _count: {
              select: { likes: true },
            },
          },
        });
      },
    );

    results.postgres.sortedRead = await this.measure(
      "Sorted Read",
      async () => {
        await this.prisma.post.findMany({
          where: { status: "active" },
          select: {
            title: true,
            created_at: true,
            user: {
              select: {
                username: true,
              },
            },
            _count: {
              select: { likes: true },
            },
          },
          orderBy: [
            { created_at: "desc" },
            { title: "asc" },
          ],
        });
      },
    );

	results.postgres.update = await this.measure(
		"Update",
		async () => {
		  await this.prisma.post.updateMany({
			data: {
				title: 'This is an updated post'
			}
		  })
		},
	)

	results.postgres.delete = await this.measure(
		"Delete",
		async () => {
		  await this.prisma.like.deleteMany();
		  await this.prisma.post.deleteMany();
		},
	  )
	
    console.log("------------------------");
    console.log("MongoDB");
    console.log("------------------------");

    // MongoDB Tests
    const db = this.mongo.db(this.dbName);

    results.mongo.writes = await this.measure("Writes", async () => {
      // Insert users with MongoDB IDs
      const userInsertResult = await db.collection("users").insertMany(
        users.map((u) => ({
          ...u,
          created_at: faker.date.past(),
        })),
      );

      const dbUsers = await db.collection("users").find().toArray();
      const posts = Array.from({ length: scale }, () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraphs(),
        status: faker.helpers.arrayElement(["active", "draft", "archived"]),
        created_at: faker.date.past(),
        user_id: faker.helpers.arrayElement(dbUsers)._id,
      }));

      const postInsertResult = await db.collection("posts").insertMany(posts);

      // Generate likes
      const allPosts = await db.collection("posts").find({}, {
        projection: { _id: 1 },
      }).toArray();
      const likes = Array.from({ length: Math.floor(scale / 2) }, () => ({
        post_id: faker.helpers.arrayElement(allPosts)._id,
        user_id: faker.helpers.arrayElement(dbUsers)._id,
        created_at: faker.date.past(),
      }));

      await db.collection("likes").insertMany(likes);
    });

    results.mongo.simpleRead = await this.measure("Simple Read", async () => {
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
    });

    results.mongo.filteredRead = await this.measure(
      "Filtered Read",
      async () => {
        await db.collection("posts").aggregate([
          {
            $match: {
              status: "active",
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
            $lookup: {
              from: "likes",
              localField: "_id",
              foreignField: "post_id",
              as: "likes",
            },
          },
          {
            $match: {
              "likes.0": { $exists: true }, // Has at least one like
            },
          },
          { $unwind: "$user" },
        ]).toArray();
      },
    );

    results.mongo.projectedRead = await this.measure(
      "Projected Read",
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
    );

    results.mongo.sortedRead = await this.measure("Sorted Read", async () => {
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
    });

	results.mongo.update = await this.measure(
		"Update",
		async () => {
		  await db.collection("posts").updateMany({ }, {  $set: { title: "Updated post" } })
		}
	)

	results.mongo.delete = await this.measure(
		"Delete",
		async () => {
		  await db.collection("likes").deleteMany()
		  await db.collection("posts").deleteMany()
		}
	)

	// console.log("------------------------");
    // console.log("Atlas MongoDB");
    // console.log("------------------------");

    // const cloudDb = this.mongoCloud.db(this.dbName);

    // results.atlas.writes = await this.measure("Writes", async () => {
    //   // Insert users with MongoDB IDs
    //   const userInsertResult = await cloudDb.collection("users").insertMany(
    //     users.map((u) => ({
    //       ...u,
    //       created_at: faker.date.past(),
    //     })),
    //   );

    //   const dbUsers = await cloudDb.collection("users").find().toArray();
    //   const posts = Array.from({ length: scale }, () => ({
    //     title: faker.lorem.sentence(),
    //     body: faker.lorem.paragraphs(),
    //     status: faker.helpers.arrayElement(["active", "draft", "archived"]),
    //     created_at: faker.date.past(),
    //     user_id: faker.helpers.arrayElement(dbUsers)._id,
    //   }));

    //   const postInsertResult = await cloudDb.collection("posts").insertMany(posts);

    //   // Generate likes
    //   const allPosts = await cloudDb.collection("posts").find({}, {
    //     projection: { _id: 1 },
    //   }).toArray();
    //   const likes = Array.from({ length: Math.floor(scale / 2) }, () => ({
    //     post_id: faker.helpers.arrayElement(allPosts)._id,
    //     user_id: faker.helpers.arrayElement(dbUsers)._id,
    //     created_at: faker.date.past(),
    //   }));

    //   await cloudDb.collection("likes").insertMany(likes);
    // });

    // results.atlas.simpleRead = await this.measure("Simple Read", async () => {
    //   await cloudDb.collection("posts").aggregate([
    //     {
    //       $lookup: {
    //         from: "users",
    //         localField: "user_id",
    //         foreignField: "_id",
    //         as: "user",
    //       },
    //     },
    //     {
    //       $lookup: {
    //         from: "likes",
    //         localField: "_id",
    //         foreignField: "post_id",
    //         as: "likes",
    //       },
    //     },
    //     { $unwind: "$user" },
    //   ]).toArray();
    // });

    // results.atlas.filteredRead = await this.measure(
    //   "Filtered Read",
    //   async () => {
    //     await cloudDb.collection("posts").aggregate([
    //       {
    //         $match: {
    //           status: "active",
    //         },
    //       },
    //       {
    //         $lookup: {
    //           from: "users",
    //           localField: "user_id",
    //           foreignField: "_id",
    //           as: "user",
    //         },
    //       },
    //       {
    //         $lookup: {
    //           from: "likes",
    //           localField: "_id",
    //           foreignField: "post_id",
    //           as: "likes",
    //         },
    //       },
    //       {
    //         $match: {
    //           "likes.0": { $exists: true }, // Has at least one like
    //         },
    //       },
    //       { $unwind: "$user" },
    //     ]).toArray();
    //   },
    // );

    // results.atlas.projectedRead = await this.measure(
    //   "Projected Read",
    //   async () => {
    //     await cloudDb.collection("posts").aggregate([
    //       {
    //         $match: { status: "active" },
    //       },
    //       {
    //         $lookup: {
    //           from: "users",
    //           localField: "user_id",
    //           foreignField: "_id",
    //           as: "user",
    //         },
    //       },
    //       {
    //         $lookup: {
    //           from: "likes",
    //           localField: "_id",
    //           foreignField: "post_id",
    //           as: "likes",
    //         },
    //       },
    //       { $unwind: "$user" },
    //       {
    //         $project: {
    //           title: 1,
    //           created_at: 1,
    //           "user.username": 1,
    //           likeCount: { $size: "$likes" },
    //         },
    //       },
    //     ]).toArray();
    //   },
    // );

    // results.atlas.sortedRead = await this.measure("Sorted Read", async () => {
    //   await cloudDb.collection("posts").aggregate([
    //     {
    //       $match: { status: "active" },
    //     },
    //     {
    //       $lookup: {
    //         from: "users",
    //         localField: "user_id",
    //         foreignField: "_id",
    //         as: "user",
    //       },
    //     },
    //     {
    //       $lookup: {
    //         from: "likes",
    //         localField: "_id",
    //         foreignField: "post_id",
    //         as: "likes",
    //       },
    //     },
    //     { $unwind: "$user" },
    //     {
    //       $project: {
    //         title: 1,
    //         created_at: 1,
    //         "user.username": 1,
    //         likeCount: { $size: "$likes" },
    //       },
    //     },
    //     {
    //       $sort: { created_at: -1, title: 1 },
    //     },
    //   ]).toArray();
    // });

	// results.atlas.update = await this.measure(
	// 	"Update",
	// 	async () => {
	// 		await cloudDb.collection("posts").updateMany({ }, {  $set: { title: "Updated post" } })
	// 	},
	// );

	// results.atlas.delete = await this.measure(
	// 	"Delete",
	// 	async () => {
	// 		await cloudDb.collection("likes").deleteMany()
	// 		await cloudDb.collection("posts").deleteMany()
	// 	},
	// );

	return results;
  }
}