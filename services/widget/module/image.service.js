"use strict";

const {MoleculerClientError} = require("moleculer").Errors;
const {ForbiddenError} = require("moleculer-web").Errors;
const fs = require("fs");
const path = require("path");
const {ObjectId} = require("mongodb");

const DbMixin = require("../../../mixins/db.mixin");

let fileUrls = [];

/**
 * @typedef {import("moleculer").Context} Context Moleculer's Context
 */

module.exports = {
	name: "widget.image",
	version: 1,

	/**
	 * Mixins
	 */
	mixins: [DbMixin("widget_image")],
	whitelist: [],
	/**
	 * Settings
	 */
	settings: {
		// Available fields in the responses
		fields: [
			"_id",
			"name",
			"provider",
			"slug",
			"path",
			"domain",
		],

		// Validator for the `create` & `insert` actions.
		entityValidator: {
			name: "string",
			slug: "string"
		},
		populates: {}
	},
	dependencies: [
		"v1.widget", // shorthand w/o version
	],
	/**
	 * Action Hooks
	 */
	hooks: {
		before: {
			/**
			 * Register a before hook for the `create` action.
			 * It sets a default value for the quantity field.
			 *
			 * @param {Context} ctx
			 */
			create(ctx) {
				ctx.params.createddAt = new Date();
				ctx.params.updatedAt = null;
				ctx.params.user = new ObjectId(ctx.meta.user.id);
				ctx.params.status = true;
			},
			update(ctx) {
				ctx.params.updatedAt = new Date();
			}
		},
		after: {
			/**
			 * Register a before hook for the `create` action.
			 * It sets a default value for the quantity field.
			 *
			 * @param {Context} ctx
			 */
			async upload(ctx, res) {
				if (res.fileUrls.length >= 1) {
					const data = [];
					res.fileUrls.forEach((val, key) => {
						data.push({
							user: new ObjectId(res.meta.user._id),
							path: val.path,
							domain: val.domain,
							name: val.name,
							provider: "local",
							file: val.file,
							slug:  this.randomName(),
						});
					});
					let entity = ctx.params;

					//await this.validateEntity(entity);
					entity.createdAt = new Date();
					entity.updatedAt = new Date();
					const doc = await this.adapter.insertMany(data);

					//let json = await this.transformDocuments(ctx, {populate: ["user"]}, doc);

					//json = await this.transformResult(ctx, json, ctx.meta.user);
					await this.entityChanged("created", doc, ctx);
					return doc.reverse()[0];
				}
			}

		}
	},

	/**
	 * Actions
	 */
	actions: {
		properties: {
			rest: "GET /properties",
			auth: "required",
			async handler(ctx) {
				return {
					name: "image",
					params: ["path", "domain", "place", "width", "height"],
					status: true
				};
			}
		},
		create: {
			auth: "required",
			params: {
				file: {type: "string"},
				source: {type: "string", optional: true},
				meta: {type: "object"}
			},
			async handler(ctx) {

			}
		},
		/**
		 * Upload Files action.
		 *
		 * @returns
		 */
		upload: {
			auth: "required",
			rest: {
				method: "POST",
				type: "multipart",
				path: "/upload",
				busboyConfig: {
					limits: {files: 3}
				},
				params: {
					files: {
						file_1: {type: "file"},

					}
				}
			},
			async handler(ctx, req, res) {
				return new this.Promise((resolve, reject) => {
					let uploadDir = "./public/upload/" + ctx.meta.user._id.toString();

					if (!fs.existsSync(uploadDir)) {
						fs.mkdirSync(uploadDir, {recursive: true});
					}

					//reject(new Error("Disk out of space"));
					const ext = ctx.meta.filename
						.split(".")
						.filter(Boolean) // removes empty extensions (e.g. `filename...txt`)
						.slice(1)
						.join(".");

					// ctx.meta.filename ||
					const fileName = this.randomName() + "." + ext;
					const filePath = path.join(uploadDir, fileName);
					const f = fs.createWriteStream(filePath);
					f.on("close", () => {
						this.logger.info(`Uploaded file stored in '${filePath}'`);
						fileUrls.push({path: uploadDir.replace("./public/",""), name: ctx.meta.filename, file: fileName, domain: "local"});

						resolve({fileUrls, meta: ctx.meta});
					});
					f.on("error", err => reject(err));

					ctx.params.pipe(f);
				});
			}
		},
		list: false,
		get: false,
		count: false,
		insert: false,
		update: false,
		remove: false
	},

	/**
	 * Methods
	 */
	methods: {
		randomName() {
			let length = 8;
			let result = "";
			const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
			let charactersLength = characters.length;
			for (let i = 0; i < length; i++) {
				result += characters.charAt(Math.floor(Math.random() *
					charactersLength));
			}
			return result;
		},
		/**
		 * Find an wallet by user
		 *
		 * @param {String} user - Article slug
		 *
		 * @results {Object} Promise<Article
		 */
		findByUser(user) {
			return this.adapter.findOne({user});
		},

		/**
		 * Transform the result entities to follow the API spec
		 *
		 * @param {Context} ctx
		 * @param {Array} entities
		 * @param {Object} user - Logged in user
		 */
		async transformResult(ctx, entities, user) {
			if (Array.isArray(entities)) {
				const images = await this.Promise.all(entities.map(item => this.transformEntity(ctx, item, user)));
				return {
					images
				};
			} else {
				const images = await this.transformEntity(ctx, entities);
				return {images};
			}
		},

		/**
		 * Transform a result entity to follow the API spec
		 *
		 * @param {Context} ctx
		 * @param {Object} entity
		 * @param {Object} user - Logged in user
		 */
		async transformEntity(ctx, entity) {
			if (!entity) return null;

			return entity;
		},
		/**
		 * Loading sample data to the collection.
		 * It is called in the DB.mixin after the database
		 * connection establishing & the collection is empty.
		 */
		async seedDB() {
		},
	},

	/**
	 * Fired after database connection establishing.
	 */
	async afterConnected() {
		// await this.adapter.collection.createIndex({ name: 1 });
	}
};
