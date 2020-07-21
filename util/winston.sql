CREATE TABLE winston_logs
(
  timestamp timestamp without time zone DEFAULT now(),
  level text,
  message text,
  filename text
)
