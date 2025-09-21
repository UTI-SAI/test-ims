select 
  addr_email, 
  * 
from 
  cust_addr_dtl 
where 
  addr_address_id = 'BI' 
  and addr_cust_code = '{ACCOUNT_ID}'