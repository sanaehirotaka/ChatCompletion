# SDKイメージを使用してアプリケーションをビルドします
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["ChatCompletionApi.csproj", "."]
RUN dotnet restore "./ChatCompletionApi.csproj"
COPY . .
WORKDIR "/src/."
RUN dotnet build "ChatCompletionApi.csproj" -c Release -o /app/build

# ランタイムイメージを使用してアプリケーションを実行します
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/build .
ENTRYPOINT ["dotnet", "ChatCompletionApi.dll"]
