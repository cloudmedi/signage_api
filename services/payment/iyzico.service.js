"use strict";
const {MoleculerClientError} = require("moleculer").Errors;
const DbMixin = require("../../mixins/db.mixin");
const config = require("config");
const Iyzipay = require("iyzipay");
const axios = require("axios");
const path = require("node:path");
const crypto = require("crypto");
const slugify = require("slugify");
const moment = require("moment");

const provider_configs = config.get("provider_creds");
const iyzico_conf = provider_configs["iyzico"];

/**
 * @typedef {import("moleculer").Context} Context Moleculer's Context
 */

module.exports = {
	name: "payment.iyzico",
	version: 1,

	/**
	 * Mixins
	 */
	mixins: [DbMixin("payments")],
	whitelist: [
		"payment.iyzico.get",
		"payment.iyzico.create",
		"payment.iyzico.update",
		"payment.iyzico.list",
	],
	/**
	 * Settings
	 */
	settings: {
		// Available fields in the responses
		fields: [
			"_id",
			"amount",
			"country",
			"start_date",
			"end_date",
			"car_rental",
			"status",
			"createdAt",
			"updatedAt",
		],

		// Validator for the `create` & `insert` actions.
		entityValidator: {
			amount: {type: "number", min: 100},
			country: {type: "string"},
			start_date: {type: "date", format: "YYYY-MM-DD"},
			end_date: {type: "date", format: "YYYY-MM-DD"},
			car_rental: {type: "boolean"},
		},
		populates: {}
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
				ctx.params.status = true;
				ctx.params.createdAt = new Date();
			},
			update(ctx) {
				ctx.params.updatedAt = new Date();
			}
		}
	},

	/**
	 * Actions
	 */
	actions: {
		start: {
			rest: "POST /start",
			params: {
				name: "string",
				email: "string",
				address: "string",
				phone: "string",
				identity_number: "string",
				city: "string",
				country: "string",
				zip_code: "string",
				state: "string",
				tour_date: {type: "date", convert: true},
				basket_items: "array",
				locale: "string",
				amount: "string",
				currency: {type: "string", default: "USD"},
				ip: {type: "string", default: "85.34.78.112"}
			},
			async handler(ctx) {
				const entity = ctx.params;
				const rnd = Math.floor(Date.now() / 1000).toString();

				const name_array = entity.name.split(" ");

				let first_name = `${name_array[0]}`;
				let last_name = `${name_array[1]}`;

				if (name_array.length > 2) {
					first_name = `${name_array[0]} ${name_array[1]}`;
					last_name = `${name_array[2]}`;
				}

				const basket_items = entity.basket_items ? entity.basket_items.map(r => {
					return {...r, itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL};
				}) : [];

				const data = {
					locale: entity.locale === "EN" ? Iyzipay.LOCALE.EN : Iyzipay.LOCALE.TR,
					conversationId: "111111111111",
					basketId: "111111111111",
					price: entity.amount,
					paidPrice: entity.amount,
					currency: entity.currency === "USD" ? Iyzipay.CURRENCY.USD : Iyzipay.CURRENCY.TRY,
					paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
					callbackUrl: iyzico_conf.callback_url,
					enabledInstallments: [1],
					buyer: {
						id: null,
						name: first_name,
						surname: last_name,
						gsmNumber: entity.phone,
						email: entity.email,
						identityNumber: entity.identity_number,
						lastLoginDate: null,
						registrationDate: null,
						registrationAddress: entity.address + " " + entity.state,
						ip: entity.ip,
						city: entity.city,
						country: entity.country,
						zipCode: entity.zip_code
					},
					billingAddress: {
						contactName: entity.name,
						city: entity.city,
						country: entity.country,
						address: entity.address + " " + entity.state,
						zipCode: entity.zip_code
					},
					basketItems: basket_items
				};

				const username = slugify(`${data.buyer.name} ${data.buyer.surname}`, {
					lower: true,      // Küçük harflere dönüştür
					strict: true      // Sadece URL dostu karakterleri tut
				});
				let user = await (await ctx.call("users.create", {
					username: `${username}${rnd}`,
					password: this.generateRandomPassword(6),
					email: data.buyer.email,
					internal: true
				}));
				if (user?.errors) {
					user = await ctx.call("users.getUserByEmail", {email: data.buyer.email});
				} else {
					user = user.user;
				}
				data.buyer.id = user._id;

				data.buyer.registrationDate = moment(user.createdAt).format("YYYY-MM-DD HH:mm:ss");
				data.buyer.lastLoginDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

				const payment = await ctx.call("v1.payment.create", {
					...entity,
					user: user._id,
					provider_request_data: data
				});

				data.basketId = `basket-${payment._id}`;
				data.conversationId = payment._id;

				const iyzipay = new Iyzipay({
					"apiKey": iyzico_conf.api_key,
					"secretKey": iyzico_conf.api_secret,
					"uri": iyzico_conf.api_base
				});

				const provider_answer = new Promise((resolve, reject) => {
					iyzipay.checkoutFormInitialize.create(data, function (err, result) {
						if (err) {
							console.error(err);
							reject(err);
						} else {
							console.log(result);
							ctx.call("v1.payment.update", {
								id: data.conversationId,
								provider_id: err ? "" : result.token,
								provider_response: err ?? result,
								status: null
							});
							resolve(result);
						}
					});
				});

				const iyzico_response = await provider_answer;

				if (iyzico_response.status === "success") {
					return {
						status: true,
						message: "Success",
						data: {
							payment_page_url: iyzico_response.paymentPageUrl,
							token_expire_time: iyzico_response.tokenExpireTime,
							token: iyzico_response.token
						}
					};
				} else {
					return {
						status: false,
						message: "Fail",
						data: {
							...iyzico_response
						}
					};
				}


			}
		},
		check_payment: {
			rest: "POST /check_payment",
			params: {
				token: "string"
			},
			async handler(ctx) {
				const token = ctx.params.token;
				const payment = await this.adapter.findOne({"provider_response.token": token});

				const iyzipay = new Iyzipay({
					"apiKey": iyzico_conf.api_key,
					"secretKey": iyzico_conf.api_secret,
					"uri": iyzico_conf.api_base
				});

				const provider_answer = new Promise((resolve, reject) => {
					iyzipay.checkoutForm.retrieve({
						locale: Iyzipay.LOCALE.TR,
						conversationId: payment._id.toString(),
						token: payment.provider_id
					}, function (err, result) {
						if (err) {
							console.error("err", err);
							reject(err);
						} else {
							console.log("result", result);
							if (result.status === "success") {
								if(result.status !== "failure") {
									ctx.call("v1.payment.update", {
										id: payment._id.toString(),
										provider_response_2: err ?? result,
										status: (result.authCode !== "" && result.paymentStatus === "SUCCESS")
									});
								}

							}
							resolve(result);
						}
					});
				});

				return await provider_answer;
			}
		},
		create: false,
		get: false,
		list: false,
		find: false,
		count: false,
		insert: false,
		update: false,
		remove: false
	},

	/**
	 * Methods
	 */
	methods: {
		generateRandomPassword(length) {
			return crypto.randomBytes(Math.ceil(length * 3 / 4))
				.toString("base64")  // base64 formatına çevir
				.slice(0, length)    // İstenen uzunluğa kısalt
				.replace(/\+/g, "0") // '+' karakterlerini '0' ile değiştir
				.replace(/\//g, "0"); // '/' karakterlerini '0' ile değiştir
		},
		generateRequestString(data) {
			function serialize(obj, prefix) {
				const str = [];
				for (const p in obj) {
					// eslint-disable-next-line no-prototype-builtins
					if (obj.hasOwnProperty(p)) {
						const k = prefix ? prefix + "." + p : p, v = obj[p];
						str.push((v !== null && typeof v === "object") ?
							serialize(v, k) :
							k + "=" + v);
					}
				}
				return str.join(",");
			}

			return `[${serialize(data)}]`;
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
				const payments = await this.Promise.all(entities.map(item => this.transformEntity(ctx, item, user)));
				return {
					payments
				};
			} else {
				const payment = await this.transformEntity(ctx, entities, user);
				return {payment};
			}
		},

		/**
		 * Transform a result entity to follow the API spec
		 *
		 * @param {Context} ctx
		 * @param {Object} entity
		 * @param {Object} user - Logged in user
		 */
		async transformEntity(ctx, entity, user) {
			if (!entity) return null;

			return entity;
		}
	},

	/**
	 * Fired after database connection establishing.
	 */
	async afterConnected() {
		// await this.adapter.collection.createIndex({ name: 1 });
	}
};
