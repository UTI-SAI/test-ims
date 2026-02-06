select 
  top 1
  clnumber, 
  invdate, 
  customer, 
  custgrp, 
  cldate, 
  invamount, 
  pic_creator, 
  senddate, 
  sendto, 
  b.clo_cust_name, 
  SendDateResend1, 
  SendtoResend1, 
  SendDateResend2, 
  SendtoResend2, 
  PICReceiveNameMl, 
  ReceiptDateResend1, 
  PICRecNameResend1, 
  ReceiptdateResend2, 
  PICRecNameResend2, 
  addr_email, 
  e.tran_no, 
  e.adjustment_status, 
  e.tran_date, 
  d.adj_voucher_no, 
  d.adj_voucher_date, 
  d.invoice_no, 
  case when charindex('/', comments) = '0' then comments else left(
    comments, 
    charindex('/', comments)-1
  ) end as invoiceno 
from 
  comgmt_track_inv_cvr a with(nolock) 
  left join cust_lo_info b with(nolock) on a.ouid = clo_created_at 
  and a.customer = clo_cust_code 
  left join cust_addr_dtl c with (nolock) on addr_created_ou = a.ouid 
  and addr_cust_code = a.customer 
  left join cbadj_receipt_vw d (nolock) on invoice_ou = a.ouid 
  and invoice_no = a.invoiceno 
  left join ci_doc_balance e (nolock) on d.receipt_ou = e.tran_ou 
  and d.receipt_no = e.tran_no 
  left join cdi_invoice_hdr f (nolock) on a.invoiceno = f.tran_no 
  and a.ouid = f.tran_ou 
where clnumber = '{CL_NUMBER}' 
  AND (
    CASE WHEN charindex('/', comments) = 0 THEN comments ELSE left(
      comments, 
      charindex('/', comments) -1
    ) END
  ) = '{INVOICE_NO}'
