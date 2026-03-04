resource "aws_dynamodb_table" "tokens" {
  name         = "${var.app_name}-tokens-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }
}
