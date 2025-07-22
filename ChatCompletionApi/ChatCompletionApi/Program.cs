using ChatCompletionApi.Service;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<ChatCompletionService>();
builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(
        policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache(opt =>
{
    opt.SizeLimit = 1024 * 16;
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger(c =>
    {
        c.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi2_0;
    });
    app.UseSwaggerUI();
}

app.UseCors();

app.UseAuthorization();

app.MapControllers();

app.Run(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PORT")) ? null : $"http://0.0.0.0:{Environment.GetEnvironmentVariable("PORT")}");
