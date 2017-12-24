SETLOCAL
set FQDN=%1
set BITS=4096

:: make directories to work from
:: mkdir -p certs/{server,client,ca,tmp}
md certs

openssl genrsa -out certs/privatekey.pem %BITS%

openssl req -new -key certs/privatekey.pem -out certs/certrequest.csr -subj "/C=US/ST=California/L=LA/O=ACME Inc/CN=%FQDN%"

openssl x509 -req -in certs/certrequest.csr -signkey certs/privatekey.pem -out certs/certificate.pem


ENDLOCAL