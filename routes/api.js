const express = require("express");
const router = express.Router();
const apiController = require("../controllers/api");
const { ensureAPIKey, ensureRoles } = require("../middleware/auth");
const upload = require("../helpers/upload");
const { ROLES } = require("../constants");

/**
 * @swagger
 * /api/invoices/send:
 *  post:
 *    security:
 *      - ApiKeyAuth: []
 *    tags:
 *      - Send Email By CL Number
 *    description: Send Email with attachment based on CL Number
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              clNumber:
 *                type: string
 *              ignoreEmail:
 *                type: boolean
 *              invoiceNo:
 *                type: array
 *                items:
 *                  type: string
 *              cc:
 *                type: string
 *              subject:
 *                type: string
 *          required:
 *            - clNumber
 *            - invoiceNo
 *    responses:
 *      '200':
 *        description: Email sent
 *      '404':
 *        description: CL or Invoice not found
 */
router.post("/invoices/send", ensureAPIKey, apiController.sendInvoiceEmail);

/**
 * @swagger
 * /api/email/status:
 *  get:
 *    security:
 *      - ApiKeyAuth: []
 *    tags:
 *      - Get Status Email
 *    description: Retrieve the status of an email task. The status can be one of the following, in-progress, sent, or failed. Use this endpoint to check the current status of an email task by providing the task ID.
 *    parameters:
 *      - in: query
 *        name: id
 *        schema:
 *          type: string
 *        description: The ID Task received when sending an email
 *    responses:
 *      '200':
 *        description: Task email data
 *        content:
 *          application/json:
 *            example:
 *              message: Successfully
 *              data:
 *                status: sent
 *      '400':
 *        description: Status id task not provided
 *        content:
 *          application/json:
 *            example:
 *              message: Please provide id
 *      '404':
 *        description: Task email not found
 *        content:
 *          application/json:
 *            example:
 *              message: Task email not found
 *      '500':
 *        description: Something went wrong
 *        content:
 *          application/json:
 *            example:
 *              message: Something went wrong
 */
router.get("/email/status", ensureAPIKey, apiController.getStatusEmail);

router.post(
  "/invoices/cancel/:invoiceNo",
  ensureAPIKey,
  apiController.cancelCL
);

/**
 * @swagger
 * /api/invoices:
 *  get:
 *    security:
 *      - ApiKeyAuth: []
 *    tags:
 *      - Retrieve Invoice
 *    description: Retrieve invoice
 *    parameters:
 *       - name: status
 *         in: query
 *         description: Filter by invoice status. Valid value are in-progress, cancelled, completed
 *         required: false
 *         schema:
 *           type: string
 *       - name: emailStatus
 *         in: query
 *         description: Filter by email send status. Valid value are draft, sent, failed
 *         required: false
 *         schema:
 *           type: string
 *    responses:
 *      '200':
 *        description: Invoice retrieved successfully
 */

router.get("/invoices", ensureAPIKey, apiController.retrieveInvoice);

router.post(
  "/invoices/upload-file",
  upload.single("file"),
  apiController.uploadInvoiceFile
);

router.get(
  "/invoices/download/:id",
  ensureRoles(ROLES.SUPER_ADMIN, ROLES.USER),
  apiController.downloadInvoice
);

router.post(
  "/invoices/resend-email",
  ensureRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  apiController.resendBillingEmail
);

router.post("/users/create", apiController.createUser);

module.exports = router;
