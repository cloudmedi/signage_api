"use strict";

const {MoleculerClientError} = require("moleculer").Errors;
const {ForbiddenError} = require("moleculer-web").Errors;
const DbMixin = require("../../mixins/db.mixin");
const {ObjectId} = require("mongodb");
const countries_json = require("../../data/countries-states-cities.json");

/**
 * @typedef {import("moleculer").Context} Context Moleculer's Context
 */

module.exports = {
	name: "source.layout",
	version: 1,

	/**
	 * Mixins
	 */
	mixins: [DbMixin("layouts")],
	whitelist: [], /**
	 * Settings
	 */
	settings: {
		// Available fields in the responses
		fields: ["_id", "name", "properties", "meta", "image", "order", "type"],

		// Validator for the `create` & `insert` actions.
		entityValidator: {
			name: "string", properties: "object", meta: "object"
		}, populates: {}
	},

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
				ctx.params.createdAt = new Date();
				ctx.params.updatedAt = new Date();
				ctx.params.status = true;
				if (!ctx.params.type) {
					ctx.params.type = "page";
				}
			}, update(ctx) {
				ctx.params.updatedAt = new Date();
			}
		}
	},

	/**
	 * Actions
	 */
	actions: {
		create: false,
		list: {
			auth: "required",
			cache: false, /*{
				ttl: 60 * 60 * 24 * 7 // 1 week
			},*/
			params: {
				type: {type: "string", "default": "page", required: false},
			},
			async handler(ctx) {
				let type = ctx.params.type;
				if (!type) {
					type = "page";
				}

				return await this.adapter.find({query: {type: type}});
			}
		},
		get: {
			auth: "required",

		},
		count: false,
		insert: false,
		update: false,
		remove: false
	},

	/**
	 * Methods
	 */
	methods: {
		/**
		 * Transform the result entities to follow the API spec
		 *
		 * @param {Context} ctx
		 * @param {Array} entities
		 * @param {Object} user - Logged in user
		 */
		async transformResult(ctx, entities, user) {
			if (Array.isArray(entities)) {
				const currency = await this.Promise.all(entities.map(item => this.transformEntity(ctx, item, user)));
				return {
					currency
				};
			} else {
				const currency = await this.transformEntity(ctx, entities);
				return {currency};
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
		}, /**
		 * Loading sample data to the collection.
		 * It is called in the DB.mixin after the database
		 * connection establishing & the collection is empty.
		 $2y$10$2WoyAcE0mbW/V3zjfIQfw.Zpp49aSlqxh.nxdI6LrIV1K4s.0XIBy
		 */
		async seedDB() {
			const data = [
				{
					name: "single",
					image: "",
					order: 10,
					type: "page",
					direction: "h",
					properties: {
						container: "flex-col",
						boxes: [
							{cell: 0, classes: "layout-single-01", meta: {}, resolution: "1920x1080"}
						],

					}, meta: {}
				},
				{
					name: "v-single",
					image: "",
					order: 10,
					direction: "v",
					properties: {
						container: "flex-col",
						boxes: [
							{
								"cell": 0,
								"classes": "h-layout-single-01",
								"meta": {},
								"resolution": "1080-1920"
							}
						]
					},
					meta: {},
					type: "page"
				},
				{
					name: "two-row",
					image: "",
					order: 20,
					type: "page",
					direction: "h",
					properties: {
						container: "flex-col",
						boxes: [
							{cell: 0, classes: "layout-two-row-01", meta: {}, resolution: "1920x960"},
							{cell: 1, classes: "layout-two-row-02", meta: {}, resolution: "1920x120"}
						]
					}, meta: {}
				},
				{
					name: "two-col",
					image: "",
					order: 30,
					type: "page",
					direction: "h",
					properties: {
						container: "flex-col",
						boxes: [
							{cell: 0, classes: "layout-two-col-01", meta: {}, resolution: "1385x1080"},
							{cell: 1, classes: "layout-two-col-02", meta: {}, resolution: "535x1080"}
						],
					}, meta: {}
				},
				{
					name: "single.widget.instagram",
					image: "",
					order: 10,
					type: "widget.instagram",
					direction: "h",
					properties: {
						container: "flex-col",
						boxes: [
							{cell: 0, classes: "instagram.layout-single-01", meta: {}, resolution: "1920x1080"}
						],

					}, meta: {}
				},
			];

			await this.adapter.insertMany(data);
		},
	},

	/**
	 * Fired after database connection establishing.
	 */
	async afterConnected() {
		// await this.adapter.collection.createIndex({ name: 1 });
	}
};
