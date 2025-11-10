# Bulk Import Email Settings - Template

## Excel File Format

Your Excel file should follow this structure:

| Column | Header Name | Description | Required | Example |
|--------|-------------|-------------|----------|---------|
| A | Customer ID | Account ID in the system | ✓ | JS10ATRAN |
| B | Account Holder Name | Name (ignored during import) | ✗ | HERMAN |
| C | Email Account Holder Name | Email (ignored during import) | ✗ | herman.w@ckb.co.id |
| D | MAIN PIC CS | Name (ignored during import) | ✗ | SITI BINTANG |
| E | Email MAIN PIC CS | Main PIC email address | ✗ | siti.bintang@ckb.co.id |
| F | E-Mail Comm - TO | Communication email | ✗ | herman.w@ckb.co.id |
| G | Commercial Manager | Name (ignored during import) | ✗ | TALAR BINTANG |
| H | E-Mail Commercial Manager - CC | Commercial Manager email | ✗ | talar.bintang@ckb.co.id |
| I | Email Milist Comercial - CC | Mailing list email | ✗ | MACollectiong@ckb.co.id |
| J | Email Finance - CC | Finance email | ✗ | ar.collection@ckb.co.id |

## Import Behavior

- **Insert**: New records with unique Customer ID will be created
- **Update**: Existing records with matching Customer ID will be updated with new email addresses
- **Skip**: Records without changes will be skipped

## Validation Rules

1. At least one email address must be provided
2. Customer ID must not be empty
3. Email addresses will be extracted from cells (names are ignored)
4. Invalid emails will be reported in the error log

## Email Distribution

When invoice is rejected, emails will be sent to:
- **TO**: Email MAIN PIC CS (Column E) + E-Mail Comm - TO (Column F)
- **CC**: E-Mail Commercial Manager - CC (Column H) + Email Milist Comercial - CC (Column I) + Email Finance - CC (Column J)

## Example Data

```
Row 1 (Header):
Customer ID | Account Holder Name | Email Account Holder Name | MAIN PIC CS | Email MAIN PIC CS | E-Mail Comm - TO | Commercial Manager | E-Mail Commercial Manager - CC | Email Milist Comercial - CC | Email Finance - CC

Row 2 (Data):
JS10ATRAN | HERMAN | herman.w@ckb.co.id | SITI BINTANG | siti.bintang@ckb.co.id | herman.w@ckb.co.id | TALAR BINTANG | talar.bintang@ckb.co.id | MACollectiong@ckb.co.id | ar.collection@ckb.co.id

Row 3 (Data):
WH25AKMAN | VIA SAKSANDA | via.saksanda@ckb.co.id | TANTRA ESNIADA | tantra.esniada@ckb.co.id | via.saksanda@ckb.co.id | WARJUNA PUTRA NIRJANA | warjuna.putra@ckb.co.id | COMMERCIALCRACKSGROUP.AJAKARTA1@ckb.co.id | ar.collection@ckb.co.id
```

## Notes

- File format: .xlsx or .xls
- Maximum file size: 50MB
- First row must contain headers
- Empty rows will be skipped
- Only email addresses are imported (names in cells are automatically extracted or ignored)
